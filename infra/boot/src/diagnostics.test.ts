import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { leakableDsn } from '../../tests/helpers/fake-secrets';
import { scrubSecretLines, type UploadBootDiagnosticsOptions, uploadBootDiagnostics } from './diagnostics';
import { createSecretRedactor } from './secret-redactor';

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

/** A boot log with `content` in a temp directory the file removes after each test. */
async function bootLog(content: string): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), 'cella-diag-'));
  const logFile = join(tempDir, 'boot.log');
  await writeFile(logFile, content, 'utf-8');
  return logFile;
}

/**
 * Uploads a failed backend boot (`overrides` aside) whose log file is missing, with no secret values known (the
 * upload's own redaction only drops URL userinfo), and records every request the upload sends.
 */
async function upload(overrides: Partial<UploadBootDiagnosticsOptions> = {}) {
  const requests: { url: string; body: string; auth?: string }[] = [];
  const keys = await uploadBootDiagnostics({
    bucket: 'cella-boot-diag',
    region: 'nl-ams',
    accessKey: 'access',
    secretKey: 'secret',
    service: 'backend',
    releaseSha: 'abc123',
    bootRc: 1,
    logFile: '/missing/log',
    redact: createSecretRedactor().redact,
    now: new Date('2026-06-19T12:00:00Z'),
    fetchImpl: async (url, init) => {
      requests.push({ url, body: init?.body ?? '', auth: init?.headers?.Authorization });
      return { ok: true, status: 200, text: async () => '' };
    },
    ...overrides,
  });
  return { keys, requests, bodies: requests.map((request) => request.body) };
}

describe('uploadBootDiagnostics', () => {
  it('carries the tail of a long boot log, naming the cut', async () => {
    const log = `${'old boot line\n'.repeat(30_000)}[release-command] [migrate] Running migrations...\n`;
    const { bodies } = await upload({ logFile: await bootLog(log) });
    expect(bodies[0]).toContain('[release-command] [migrate] Running migrations...');
    expect(bodies[0]).toMatch(/\[earlier \d+ characters cut\]/);
    expect(bodies[0]?.length).toBeLessThan(300 * 1024);
  });

  it('names the failed phase and its error ahead of the boot log', async () => {
    const { bodies } = await upload({ failedPhase: 'release-command', failure: 'docker compose run timed out after 180s' });
    expect(bodies[0]).toContain('boot_rc=1\nfailed_phase=release-command\n\n--- boot error ---\ndocker compose run timed out after 180s');
  });

  it('uploads full and failure logs for failed boots', async () => {
    const { keys, requests } = await upload({ logFile: await bootLog('hello boot') });
    expect(keys).toEqual(['boot-diag/backend-20260619T120000Z-boot.log', 'boot-diag/backend-failed-20260619T120000Z.log']);
    expect(requests).toHaveLength(2);
    const first = requests[0]!;
    expect(first.url).toContain('https://cella-boot-diag.s3.nl-ams.scw.cloud/boot-diag/backend-20260619T120000Z-boot.log');
    expect(first.auth).toMatch(/AWS4-HMAC-SHA256 Credential=access\/20260619\/nl-ams\/s3\/aws4_request/);
    expect(first.body).toContain('release=abc123');
    expect(first.body).toContain('hello boot');
  });

  it('uploads only the full log for successful boots', async () => {
    const { keys, requests } = await upload({ service: 'frontend', bootRc: 0 });
    expect(keys).toEqual(['boot-diag/frontend-20260619T120000Z-boot.log']);
    expect(requests).toHaveLength(1);
  });

  it('appends the captured app logs to the uploaded body', async () => {
    const { bodies } = await upload({ appLogs: 'node:internal/modules ... ERR_MODULE_NOT_FOUND' });
    const body = bodies.at(-1);
    expect(body).toContain('--- app logs ---');
    expect(body).toContain('ERR_MODULE_NOT_FOUND');
  });

  it('scrubs secret-bearing lines from both the boot log and the app logs before upload', async () => {
    const { bodies } = await upload({
      logFile: await bootLog('boot start\nDATABASE_URL=postgresql://admin:pw@host/db\nboot end'),
      appLogs: 'crash dump\nCOOKIE_SECRET=abc\nstack trace line',
    });
    const body = bodies[0];
    expect(body).toContain('boot start');
    expect(body).toContain('stack trace line');
    expect(body).not.toContain('postgresql://admin');
    expect(body).not.toContain('COOKIE_SECRET=abc');
    expect(body).toContain('[line scrubbed: matched secret pattern]');
  });

  it('must not upload a secret value via the events JSONL, the boot log or the app logs', async () => {
    const { password: dbPassword, dsn } = leakableDsn();
    const cookieSecret = 'ck-9d1e77a0b3ff';
    const redactor = createSecretRedactor();
    redactor.add(dsn, cookieSecret);
    const { bodies } = await upload({
      // No line names a secret variable, so only redaction by value can catch these.
      logFile: await bootLog(`boot start\nrelease failed: dial ${dsn}\nboot end`),
      redact: redactor.redact,
      appLogs: `backend  | token ${cookieSecret} rejected\nbackend  | pg auth failed for ${dbPassword}`,
      events: [
        JSON.stringify({ eventName: 'boot.step.failed', body: { stringValue: `release-command FAILED: ${dsn}` } }),
        JSON.stringify({ eventName: 'boot.failed', body: { stringValue: `app log tail: ${cookieSecret}` } }),
      ].join('\n'),
    });

    // Positive control: all three objects uploaded, with the diagnostic text around each secret.
    expect(bodies).toHaveLength(3);
    const uploaded = bodies.join('\n');
    expect(uploaded).toContain('release failed: dial [REDACTED]');
    expect(uploaded).toContain('token [REDACTED] rejected');
    expect(uploaded).toContain('boot.step.failed');
    for (const secret of [dbPassword, cookieSecret, `app:${dbPassword}`]) expect(uploaded).not.toContain(secret);
  });
});

describe('scrubSecretLines', () => {
  it('replaces lines matching the cloud-init scrub pattern and keeps the rest', () => {
    const input = ['ok line', 'MY_API_KEY=xyz', 'docker login rg.fr-par.scw.cloud', 'PASSWORD: hunter2', 'final line'].join('\n');
    const out = scrubSecretLines(input);
    expect(out.split('\n')).toEqual([
      'ok line',
      '[line scrubbed: matched secret pattern]',
      '[line scrubbed: matched secret pattern]',
      '[line scrubbed: matched secret pattern]',
      'final line',
    ]);
  });
});
