import { afterEach, describe, expect, it, vi } from 'vitest';
import { leakableDsn } from '../../tests/helpers/fake-secrets';
import { boot, waitForPrivateNetwork } from './boot';
import type { ExecFn, ExecResult } from './exec';

/** The VM's files: the plan and key files cloud-init writes, plus whatever boot writes itself. */
const files = vi.hoisted(() => new Map<string, string>());

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: vi.fn(async (path: unknown) => {
      const content = files.get(String(path));
      if (content === undefined) throw Object.assign(new Error(`ENOENT: ${String(path)}`), { code: 'ENOENT' });
      return content;
    }),
  };
});
vi.mock('./fs-utils', () => ({
  writeFileMode: vi.fn(async (path: string, content: string) => {
    files.set(path, content);
  }),
}));

describe('waitForPrivateNetwork', () => {
  it('retries until route and private address are available', async () => {
    const calls: string[] = [];
    let routeAttempts = 0;
    const exec: ExecFn = async (command, args) => {
      calls.push([command, ...args].join(' '));
      if (args.join(' ') === 'route get 10.0.0.1') {
        routeAttempts += 1;
        return { code: routeAttempts === 1 ? 1 : 0, stdout: '', stderr: '' };
      }
      return { code: 0, stdout: '2: ens2    inet 10.0.0.12/24 brd 10.0.0.255 scope global ens2', stderr: '' };
    };

    await waitForPrivateNetwork({ exec, timeoutSeconds: 1, retryDelayMs: 1 });

    expect(calls).toEqual(['ip route get 10.0.0.1', 'ip route get 10.0.0.1', 'ip -4 addr show']);
  });

  it('fails when the private address never appears', async () => {
    const exec: ExecFn = async (_command, args) => {
      if (args.join(' ') === 'route get 10.0.0.1') return { code: 0, stdout: '', stderr: '' };
      return { code: 0, stdout: '2: ens2    inet 192.0.2.12/24 scope global ens2', stderr: '' };
    };

    await expect(waitForPrivateNetwork({ exec, timeoutSeconds: 0.001, retryDelayMs: 1 })).rejects.toThrow(/private network did not become ready/);
  });
});

describe('boot', () => {
  afterEach(() => {
    files.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('must not upload, export or print a secret via a failed release command', async () => {
    const bootKey = { accessKey: 'SCWBOOTACCESSKEY0001', secretKey: 'boot-sk-1111-2222-3333' };
    const serviceKey = { accessKey: 'SCWSERVICEACCESSKEY2', secretKey: 'svc-sk-4444-5555-6666' };
    const { password: dbPassword, dsn } = leakableDsn();
    const cookieSecret = 'ck-8888bbbbdd';
    const sinkKey = 'ik-9999ccccee';
    const secretValues: Record<string, string> = {
      'db-url-id': dsn,
      'cookie-id': cookieSecret,
      'sink-id': sinkKey,
      'handoff-id': JSON.stringify(serviceKey),
    };

    files.set('/etc/app/scw-access-key', `${bootKey.accessKey}\n`);
    files.set('/etc/app/scw-secret-key', `${bootKey.secretKey}\n`);
    files.set(
      '/etc/app/boot-plan.json',
      JSON.stringify({
        schemaVersion: 1,
        service: 'backend',
        profile: 'backend',
        releaseSha: 'abc123',
        telemetry: { endpoint: 'https://ingest.example/v1', keyHeader: 'x-ingest-key', keyEnvVar: 'SINK_INGEST_KEY' },
        imageContract: 'docker-node-boot-v1',
        registry: 'rg.nl-ams.scw.cloud/ns',
        region: 'nl-ams',
        credentials: { scwAccessKeyFile: '/etc/app/scw-access-key', scwSecretKeyFile: '/etc/app/scw-secret-key' },
        serviceKeyHandoff: { secretId: 'handoff-id', cacheFile: '/etc/app/service-key.json' },
        exportS3Env: true,
        bootDiagnostics: { bucket: 'app-boot-diag', logFile: '/var/log/infra-boot.log' },
        releaseCommand: { enabled: true, command: ['docker', 'compose', 'run', '--rm', 'backend-release'] },
        docker: { composeFile: '/opt/app/compose.yml' },
        files: {
          compose: 'services: {}',
          env: 'BACKEND_TAG=abc123',
          runtimeSecretManifest: [
            { envVar: 'DATABASE_URL', secretId: 'db-url-id', required: true },
            { envVar: 'COOKIE_SECRET', secretId: 'cookie-id', required: true },
            { envVar: 'SINK_INGEST_KEY', secretId: 'sink-id', required: false },
          ],
        },
        timeouts: { privateNetworkSeconds: 5, pullAttempts: 1, pullRetrySeconds: 1, releaseCommandSeconds: 180 },
      }),
    );

    const sent: Array<{ url: string; body: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { body?: string }) => {
        const secretId = /\/secrets\/([^/]+)\/versions\//.exec(url)?.[1];
        if (secretId) {
          const data = Buffer.from(secretValues[secretId] ?? '').toString('base64');
          return new Response(JSON.stringify({ data }), { status: 200 });
        }
        sent.push({ url, body: String(init?.body ?? '') });
        return new Response('', { status: 200 });
      }),
    );
    const printed: string[] = [];
    vi.spyOn(console, 'info').mockImplementation((line: unknown) => {
      printed.push(String(line));
    });

    const ok = (stdout = ''): ExecResult => ({ code: 0, stdout, stderr: '' });
    // The migrate companion dies printing its connection string; the container log tail repeats secrets it saw, the
    // service key and the boot key among them, each without the name that would get its line scrubbed.
    const exec: ExecFn = async (command, args, opts) => {
      const line = [command, ...args].join(' ');
      if (line === 'ip -4 addr show') return ok('inet 10.0.0.12/24 scope global ens2');
      if (line.includes('run --rm backend-release')) {
        // Streamed as it prints, the way execCommand hands lines over, and returned whole.
        const stderr = `migrate: dial ${dsn} refused (auth ${dbPassword})`;
        opts?.onLine?.(stderr, 'stderr');
        return { code: 1, stdout: '', stderr };
      }
      if (line.includes(' logs ')) {
        return ok(
          [
            `backend | auth rejected ${cookieSecret}`,
            `backend | sink ${sinkKey}`,
            `backend | s3 refused ${serviceKey.secretKey}, then ${bootKey.secretKey}`,
          ].join('\n'),
        );
      }
      return ok();
    };

    const error = await boot({ planPath: '/etc/app/boot-plan.json', exec }).catch((err: unknown) => err);

    // Positive control: the boot failed at the release step, and every channel still carried the diagnosis.
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('failed with exit 1');
    const uploads = sent.filter((request) => request.url.startsWith('https://app-boot-diag.'));
    expect(uploads.map((request) => request.url.split('/boot-diag/')[1])).toEqual([
      expect.stringMatching(/^backend-.*-boot\.log$/),
      expect.stringMatching(/^backend-failed-.*\.log$/),
      expect.stringMatching(/^backend-.*-events\.jsonl$/),
    ]);
    expect(uploads[2]?.body).toContain('release-command');
    expect(uploads[0]?.body).toContain('auth rejected [REDACTED]');
    expect(sent.some((request) => request.url === 'https://ingest.example/v1/logs')).toBe(true);
    expect(printed.some((line) => line.includes('boot-failed'))).toBe(true);

    const channels = [...sent.map((request) => request.body), ...printed, (error as Error).message].join('\n');
    for (const secret of [bootKey.secretKey, serviceKey.secretKey, dbPassword, cookieSecret, sinkKey]) {
      expect(channels).not.toContain(secret);
    }
  });

  it('kills a stuck release companion, removes its container and names the phase in the upload', async () => {
    files.set('/etc/app/scw-access-key', 'SCWBOOTACCESSKEY0001\n');
    files.set('/etc/app/scw-secret-key', 'boot-sk-1111-2222-3333\n');
    files.set(
      '/etc/app/boot-plan.json',
      JSON.stringify({
        schemaVersion: 1,
        service: 'backend',
        profile: 'backend',
        releaseSha: 'abc123',
        imageContract: 'docker-node-boot-v1',
        registry: 'rg.nl-ams.scw.cloud/ns',
        region: 'nl-ams',
        credentials: { scwAccessKeyFile: '/etc/app/scw-access-key', scwSecretKeyFile: '/etc/app/scw-secret-key' },
        bootDiagnostics: { bucket: 'app-boot-diag', logFile: '/var/log/infra-boot.log' },
        releaseCommand: {
          enabled: true,
          command: ['docker', 'compose', 'run', '--rm', '--name', 'backend-release-run', 'backend-release'],
          containerName: 'backend-release-run',
        },
        docker: { composeFile: '/opt/app/compose.yml' },
        files: { compose: 'services: {}', env: 'BACKEND_TAG=abc123', runtimeSecretManifest: [] },
        timeouts: { privateNetworkSeconds: 5, pullAttempts: 1, pullRetrySeconds: 1, releaseCommandSeconds: 180 },
      }),
    );
    const sent: Array<{ url: string; body: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { body?: string }) => {
        sent.push({ url, body: String(init?.body ?? '') });
        return new Response('', { status: 200 });
      }),
    );
    vi.spyOn(console, 'info').mockImplementation(() => {});

    const calls: Array<{ line: string; timeoutMs?: number }> = [];
    const exec: ExecFn = async (command, args, opts) => {
      const line = [command, ...args].join(' ');
      calls.push({ line, timeoutMs: opts?.timeoutMs });
      if (line === 'ip -4 addr show') return { code: 0, stdout: 'inet 10.0.0.12/24 scope global ens2', stderr: '' };
      // The migrate companion waits on a lock until the ceiling kills it.
      if (line.includes(' run --rm ')) return { code: 124, stdout: '[migrate] Running migrations...', stderr: '', timedOut: true };
      return { code: 0, stdout: '', stderr: '' };
    };

    const error = await boot({ planPath: '/etc/app/boot-plan.json', exec }).catch((err: unknown) => err);

    expect((error as Error).message).toMatch(/timed out after 180s/);
    const run = calls.findIndex((call) => call.line.includes(' run --rm '));
    expect(calls[run]?.timeoutMs).toBe(180_000);
    // Cleared before the run (a leftover from an interrupted boot) and after the kill (the container outlives its CLI).
    expect(calls[run - 1]?.line).toBe('docker rm --force backend-release-run');
    expect(calls[run + 1]?.line).toBe('docker rm --force backend-release-run');
    // No docker call runs without a ceiling.
    expect(calls.filter((call) => call.line.startsWith('docker ')).every((call) => call.timeoutMs !== undefined)).toBe(true);

    const bootLog = sent.find((request) => /\/boot-diag\/backend-\d{8}T\d{6}Z-boot\.log$/.test(request.url));
    expect(bootLog?.body).toContain('release=abc123');
    expect(bootLog?.body).toContain('failed_phase=release-command');
    expect(bootLog?.body).toContain('[migrate] Running migrations...');
  });

  describe('live telemetry', () => {
    /** A backend plan whose runtime manifest delivers the sink's ingest key, so boot telemetry exports. */
    function writeSinkPlan(): void {
      files.set('/etc/app/scw-access-key', 'SCWBOOTACCESSKEY0001\n');
      files.set('/etc/app/scw-secret-key', 'boot-sk-1111-2222-3333\n');
      files.set(
        '/etc/app/boot-plan.json',
        JSON.stringify({
          schemaVersion: 1,
          service: 'backend',
          profile: 'backend',
          releaseSha: 'abc123',
          telemetry: { endpoint: 'https://ingest.example/v1', keyHeader: 'x-ingest-key', keyEnvVar: 'SINK_INGEST_KEY' },
          imageContract: 'docker-node-boot-v1',
          registry: 'rg.nl-ams.scw.cloud/ns',
          region: 'nl-ams',
          credentials: { scwAccessKeyFile: '/etc/app/scw-access-key', scwSecretKeyFile: '/etc/app/scw-secret-key' },
          bootDiagnostics: { bucket: 'app-boot-diag', logFile: '/var/log/infra-boot.log' },
          releaseCommand: { enabled: true, command: ['docker', 'compose', 'run', '--rm', 'backend-release'] },
          docker: { composeFile: '/opt/app/compose.yml' },
          files: {
            compose: 'services: {}',
            env: 'BACKEND_TAG=abc123',
            runtimeSecretManifest: [{ envVar: 'SINK_INGEST_KEY', secretId: 'sink-id', required: false }],
          },
          timeouts: { privateNetworkSeconds: 5, pullAttempts: 1, pullRetrySeconds: 1, releaseCommandSeconds: 180 },
        }),
      );
    }

    /** Stub fetch: Secret Manager answers the sink key, the sink answers `sinkStatus`, and every sink and upload request is recorded. */
    function stubNetwork(sinkStatus: number): Array<{ url: string; body: string }> {
      const sent: Array<{ url: string; body: string }> = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: { body?: string }) => {
          if (url.includes('/secrets/'))
            return new Response(JSON.stringify({ data: Buffer.from('ik-1234567890').toString('base64') }), { status: 200 });
          sent.push({ url, body: String(init?.body ?? '') });
          return new Response('', { status: url.startsWith('https://ingest.example/') ? sinkStatus : 200 });
        }),
      );
      vi.spyOn(console, 'info').mockImplementation(() => {});
      return sent;
    }

    /** An exec whose release companion runs for `releaseMs` of (fake) time; everything else succeeds at once. */
    const slowReleaseExec =
      (releaseMs: number): ExecFn =>
      async (command, args) => {
        const line = [command, ...args].join(' ');
        if (line === 'ip -4 addr show') return { code: 0, stdout: 'inet 10.0.0.12/24 scope global ens2', stderr: '' };
        if (line.includes(' run --rm ')) {
          await new Promise((resolve) => setTimeout(resolve, releaseMs));
        }
        return { code: 0, stdout: '', stderr: '' };
      };

    const sinkEvents = (sent: Array<{ url: string; body: string }>) =>
      sent
        .filter((request) => request.url === 'https://ingest.example/v1/logs')
        .flatMap(
          (request) =>
            JSON.parse(request.body).resourceLogs[0].scopeLogs[0].logRecords as Array<{ eventName: string; body?: { stringValue?: string } }>,
        );

    afterEach(() => {
      vi.useRealTimers();
    });

    it('exports a heartbeat while a phase hangs, before the phase ends', async () => {
      vi.useFakeTimers();
      writeSinkPlan();
      const sent = stubNetwork(200);
      const booted = boot({ planPath: '/etc/app/boot-plan.json', exec: slowReleaseExec(65_000) });

      await vi.advanceTimersByTimeAsync(31_000);
      // The buffered start and early phases shipped once the key arrived; the release companion still runs.
      const live = sinkEvents(sent).map((record) => record.eventName);
      expect(live).toContain('boot.started');
      expect(live).toContain('boot.step.completed');
      const heartbeat = sinkEvents(sent).find((record) => record.eventName === 'boot.step.running');
      expect(heartbeat?.body?.stringValue).toBe('backend boot step release-command still running after 30s');
      expect(live).not.toContain('boot.completed');

      await vi.advanceTimersByTimeAsync(40_000);
      await expect(booted).resolves.toBeUndefined();
      expect(sinkEvents(sent).filter((record) => record.eventName === 'boot.step.running')).toHaveLength(2);
      // Every heartbeat and export timer is stopped once the boot returns.
      expect(vi.getTimerCount()).toBe(0);
    });

    it('streams the release companion output to the console and as capped telemetry records', async () => {
      writeSinkPlan();
      const sent = stubNetwork(200);
      const printed: string[] = [];
      vi.mocked(console.info).mockImplementation((line: unknown) => void printed.push(String(line)));
      const exec: ExecFn = async (command, args, opts) => {
        const line = [command, ...args].join(' ');
        if (line === 'ip -4 addr show') return { code: 0, stdout: 'inet 10.0.0.12/24 scope global ens2', stderr: '' };
        if (line.includes(' run --rm ')) {
          for (let index = 1; index <= 250; index++) opts?.onLine?.(`[migrate] step ${index} with ik-1234567890`, 'stdout');
        }
        return { code: 0, stdout: '', stderr: '' };
      };
      await boot({ planPath: '/etc/app/boot-plan.json', exec });

      expect(printed).toContain('[release-command] [migrate] step 1 with [REDACTED]');
      expect(printed).toContain('[release-command] [migrate] step 250 with [REDACTED]');
      const output = sinkEvents(sent).filter((record) => record.eventName === 'boot.output');
      expect(output).toHaveLength(200);
      expect(output[0]?.body?.stringValue).toBe('[migrate] step 1 with [REDACTED]');
      expect(sinkEvents(sent).filter((record) => record.eventName === 'boot.output.capped')).toHaveLength(1);
      expect(sent.map((request) => request.body).join('\n')).not.toContain('ik-1234567890');
    });

    it('boots and uploads its diagnostics while the sink rejects every export', async () => {
      vi.useFakeTimers();
      writeSinkPlan();
      const sent = stubNetwork(500);
      const booted = boot({ planPath: '/etc/app/boot-plan.json', exec: slowReleaseExec(35_000) });
      await vi.advanceTimersByTimeAsync(40_000);
      await expect(booted).resolves.toBeUndefined();
      expect(sent.some((request) => request.url.startsWith('https://app-boot-diag.'))).toBe(true);
    });
  });
});
