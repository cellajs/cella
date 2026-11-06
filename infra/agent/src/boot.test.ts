import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { leakableDsn } from '../../tests/helpers/fake-secrets';
import { boot, waitForPrivateNetwork } from './boot';
import type { ExecFn, ExecResult } from './exec';

/** The machine's files: the plan cloud-init writes, plus whatever boot writes itself. */
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

const link = (object: string) => `https://app-boot-diag.s3.nl-ams.scw.cloud/${object}?X-Amz-Expires=900&X-Amz-Signature=${'f'.repeat(64)}`;
const envLink = link('env/backend-abc123.env');
const accountLink = link('boot-diag/backend-20261103T120000Z-boot.log');
const archiveLink = link('releases/abc123/images/backend.tar');
const archiveBody = 'the backend image archive';

function writePlan(overrides: Record<string, unknown> = {}): void {
  files.set(
    '/etc/app/boot-plan.json',
    JSON.stringify({
      schemaVersion: 3,
      service: 'backend',
      profile: 'backend',
      services: ['backend'],
      releaseSha: 'abc123',
      telemetry: { endpoint: 'https://ingest.example/v1', keyHeader: 'x-ingest-key', keyEnvVar: 'SINK_INGEST_KEY' },
      imageContract: 'docker-node-boot-v1',
      links: {
        env: envLink,
        bootAccount: accountLink,
        archives: [
          { name: 'backend', image: 'rg/ns/backend:abc123', url: archiveLink, sha256: createHash('sha256').update(archiveBody).digest('hex') },
        ],
      },
      bootDiagnostics: { logFile: '/var/log/infra-boot.log' },
      docker: { composeFile: '/opt/app/compose.yml' },
      agent: { ports: [{ service: 'backend', agentPort: 9000, port: 4000 }], drainSeconds: 10 },
      timeouts: { privateNetworkSeconds: 5, fetchAttempts: 1, fetchRetrySeconds: 1, composeWaitSeconds: 240 },
      ...overrides,
    }),
  );
}

/** Stub fetch: the env link serves `env`, the archive link the archive, the sink answers `sinkStatus`; every other request is recorded. */
function stubNetwork(opts: { env: string; archive?: string; sinkStatus?: number }) {
  const sent: Array<{ url: string; method: string; body: string }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      if (url === envLink) return new Response(opts.env, { status: 200 });
      if (url === archiveLink) return new Response(opts.archive ?? archiveBody, { status: 200 });
      sent.push({ url, method: init?.method ?? 'GET', body: String(init?.body ?? '') });
      return new Response('', { status: url.startsWith('https://ingest.example/') ? (opts.sinkStatus ?? 200) : 200 });
    }),
  );
  return sent;
}

const ok = (stdout = ''): ExecResult => ({ code: 0, stdout, stderr: '' });
const isUp = (line: string) => line.startsWith('docker compose') && line.includes(' up ');
const archiveDir = () => mkdtempSync(join(tmpdir(), 'archives-'));

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
    vi.useRealTimers();
  });

  it('must not upload, export or print a secret or a link via a failed release companion', async () => {
    const { password: dbPassword, dsn } = leakableDsn();
    const cookieSecret = 'ck-8888bbbbdd';
    const sinkKey = 'ik-9999ccccee';
    writePlan();
    // The host boot log, mounted into the agent: cloud-init's script and earlier output, a secret among it without its name.
    files.set('/var/log/infra-boot.log', `::cella:: boot start\nlauncher saw ${cookieSecret}\nDATABASE_URL=${dsn}\n`);
    const sent = stubNetwork({ env: `DATABASE_URL=${dsn}\nCOOKIE_SECRET=${cookieSecret}\nSINK_INGEST_KEY=${sinkKey}\n` });
    const printed: string[] = [];
    vi.spyOn(console, 'info').mockImplementation((line: unknown) => {
      printed.push(String(line));
    });

    // The migrate companion dies printing its connection string; the container log tail repeats secrets it saw, and a link, each without
    // the name that would get its line scrubbed.
    const exec: ExecFn = async (command, args, opts) => {
      const line = [command, ...args].join(' ');
      if (line === 'ip -4 addr show') return ok('inet 10.0.0.12/24 scope global ens2');
      if (isUp(line)) {
        const stderr = `dependency failed to start: container backend-release exited (1): dial ${dsn} refused (auth ${dbPassword})`;
        opts?.onLine?.(stderr, 'stderr');
        return { code: 1, stdout: '', stderr };
      }
      if (line.includes(' logs '))
        return ok([`backend | auth rejected ${cookieSecret}`, `backend | sink ${sinkKey}`, `fetched ${envLink}`].join('\n'));
      return ok();
    };

    const error = await boot({ planPath: '/etc/app/boot-plan.json', exec, archiveDir: archiveDir() }).catch((err: unknown) => err);

    // Positive control: the boot failed at the start, kept its env file, and every channel still carried the diagnosis.
    expect((error as Error).message).toContain('failed with exit 1');
    expect(files.get('/opt/app/.env.runtime')).toContain('COOKIE_SECRET=');
    const uploads = sent.filter((request) => request.method === 'PUT');
    expect(uploads.map((request) => request.url)).toEqual([accountLink]);
    expect(uploads[0]?.body).toContain('failed_phase=start-service');
    expect(uploads[0]?.body).toContain('auth rejected [REDACTED]');
    expect(uploads[0]?.body).toContain('::cella:: boot start\nlauncher saw [REDACTED]');
    expect(sent.some((request) => request.url === 'https://ingest.example/v1/logs')).toBe(true);

    const channels = [...sent.map((request) => request.body), ...printed, (error as Error).message].join('\n');
    for (const secret of [dbPassword, cookieSecret, sinkKey, envLink, 'X-Amz-Signature']) expect(channels).not.toContain(secret);
  });

  it("must not load an archive that differs from its digest: whoever replaces it in the bucket cannot choose the machine's code", async () => {
    writePlan();
    const sent = stubNetwork({ env: 'COOKIE_SECRET=ck-12345678\n', archive: 'an image someone else built' });
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const calls: string[] = [];
    const exec: ExecFn = async (command, args) => {
      const line = [command, ...args].join(' ');
      calls.push(line);
      if (line === 'ip -4 addr show') return ok('inet 10.0.0.12/24 scope global ens2');
      if (line.startsWith('docker image inspect')) return { code: 1, stdout: '', stderr: 'No such image' };
      return ok();
    };

    const error = await boot({ planPath: '/etc/app/boot-plan.json', exec, archiveDir: archiveDir() }).catch((err: unknown) => err);

    expect((error as Error).message).toMatch(/differs from its digest/);
    expect(calls.some((line) => line.startsWith('docker load'))).toBe(false);
    expect(calls.some(isUp)).toBe(false);
    expect(sent.find((request) => request.method === 'PUT')?.body).toContain('failed_phase=load-images');
  });

  it('boots again after a reboot without a link: the env file is kept and the images are loaded', async () => {
    writePlan();
    files.set('/opt/app/.env.runtime', 'COOKIE_SECRET=ck-12345678\n');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === envLink || url === archiveLink) throw new Error('the link ended');
        return new Response('', { status: 403 });
      }),
    );
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const calls: string[] = [];
    const exec: ExecFn = async (command, args) => {
      calls.push([command, ...args].join(' '));
      return command === 'ip' ? ok('inet 10.0.0.12/24 scope global ens2') : ok();
    };

    await boot({ planPath: '/etc/app/boot-plan.json', exec, archiveDir: archiveDir() });

    expect(calls.filter(isUp)).toEqual(['docker compose --profile backend up -d --wait --wait-timeout 240 backend']);
  });

  describe('live telemetry', () => {
    /** An exec whose compose up runs for `upMs` of (fake) time; everything else succeeds at once. */
    const slowUpExec =
      (upMs: number): ExecFn =>
      async (command, args) => {
        const line = [command, ...args].join(' ');
        if (line === 'ip -4 addr show') return ok('inet 10.0.0.12/24 scope global ens2');
        if (isUp(line)) await new Promise((resolve) => setTimeout(resolve, upMs));
        return ok();
      };

    const sinkEvents = (sent: Array<{ url: string; body: string }>) =>
      sent
        .filter((request) => request.url === 'https://ingest.example/v1/logs')
        .flatMap(
          (request) =>
            JSON.parse(request.body).resourceLogs[0].scopeLogs[0].logRecords as Array<{ eventName: string; body?: { stringValue?: string } }>,
        );

    it('exports a heartbeat while a phase hangs, before the phase ends', async () => {
      vi.useFakeTimers();
      writePlan();
      const sent = stubNetwork({ env: 'SINK_INGEST_KEY=ik-1234567890\n' });
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const booted = boot({ planPath: '/etc/app/boot-plan.json', exec: slowUpExec(65_000), archiveDir: archiveDir() });

      await vi.advanceTimersByTimeAsync(31_000);
      // The buffered start and early phases shipped once the key arrived; compose up still runs.
      const live = sinkEvents(sent).map((record) => record.eventName);
      expect(live).toContain('boot.started');
      expect(live).toContain('boot.step.completed');
      const heartbeat = sinkEvents(sent).find((record) => record.eventName === 'boot.step.running');
      expect(heartbeat?.body?.stringValue).toBe('backend boot step start-service still running after 30s');
      expect(live).not.toContain('boot.completed');

      await vi.advanceTimersByTimeAsync(40_000);
      await expect(booted).resolves.toBeUndefined();
      expect(sinkEvents(sent).filter((record) => record.eventName === 'boot.step.running')).toHaveLength(2);
      // Every heartbeat and export timer is stopped once the boot returns.
      expect(vi.getTimerCount()).toBe(0);
    });

    it('streams compose output to the console and as capped telemetry records', async () => {
      writePlan();
      const sent = stubNetwork({ env: 'SINK_INGEST_KEY=ik-1234567890\n' });
      const printed: string[] = [];
      vi.spyOn(console, 'info').mockImplementation((line: unknown) => void printed.push(String(line)));
      const exec: ExecFn = async (command, args, opts) => {
        const line = [command, ...args].join(' ');
        if (line === 'ip -4 addr show') return ok('inet 10.0.0.12/24 scope global ens2');
        if (isUp(line)) for (let index = 1; index <= 250; index++) opts?.onLine?.(`[migrate] step ${index} with ik-1234567890`, 'stdout');
        return ok();
      };
      await boot({ planPath: '/etc/app/boot-plan.json', exec, archiveDir: archiveDir() });

      expect(printed).toContain('[start-service] [migrate] step 1 with [REDACTED]');
      expect(printed).toContain('[start-service] [migrate] step 250 with [REDACTED]');
      const output = sinkEvents(sent).filter((record) => record.eventName === 'boot.output');
      expect(output).toHaveLength(200);
      expect(output[0]?.body?.stringValue).toBe('[migrate] step 1 with [REDACTED]');
      expect(sinkEvents(sent).filter((record) => record.eventName === 'boot.output.capped')).toHaveLength(1);
      expect(sent.map((request) => request.body).join('\n')).not.toContain('ik-1234567890');
    });

    it('boots and uploads its account while the sink rejects every export', async () => {
      vi.useFakeTimers();
      writePlan();
      const sent = stubNetwork({ env: 'SINK_INGEST_KEY=ik-1234567890\n', sinkStatus: 500 });
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const booted = boot({ planPath: '/etc/app/boot-plan.json', exec: slowUpExec(35_000), archiveDir: archiveDir() });
      await vi.advanceTimersByTimeAsync(40_000);
      await expect(booted).resolves.toBeUndefined();
      expect(sent.some((request) => request.url === accountLink)).toBe(true);
    });
  });
});
