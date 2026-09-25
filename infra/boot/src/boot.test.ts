import { afterEach, describe, expect, it, vi } from 'vitest';
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

    await expect(waitForPrivateNetwork({ exec, timeoutSeconds: 0.001, retryDelayMs: 1 })).rejects.toThrow(
      /private network did not become ready/,
    );
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
    const dbPassword = 'pg-pw-7777aaaa';
    const dsn = `postgresql://app:${dbPassword}@10.0.0.5:5432/app?sslmode=require`;
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
        timeouts: { privateNetworkSeconds: 5, pullAttempts: 1, pullRetrySeconds: 1 },
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
    // The migrate companion dies printing its connection string; the container log tail repeats secrets it saw.
    const exec: ExecFn = async (command, args) => {
      const line = [command, ...args].join(' ');
      if (line === 'ip -4 addr show') return ok('inet 10.0.0.12/24 scope global ens2');
      if (line.includes('run --rm backend-release'))
        return { code: 1, stdout: '', stderr: `migrate: dial ${dsn} refused (auth ${dbPassword})` };
      if (line.includes(' logs ')) return ok(`backend | auth rejected ${cookieSecret}\nbackend | sink ${sinkKey}`);
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
});
