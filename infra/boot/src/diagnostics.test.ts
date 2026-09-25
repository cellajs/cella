import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scrubSecretLines, uploadBootDiagnostics } from './diagnostics';
import { createSecretRedactor } from './secret-redactor';

/** No values known: the upload's own redaction only drops URL userinfo. */
const noKnownSecrets = createSecretRedactor().redact;

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe('uploadBootDiagnostics', () => {
  it('uploads full and failure logs for failed boots', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cella-diag-'));
    const logFile = join(tempDir, 'boot.log');
    await writeFile(logFile, 'hello boot', 'utf-8');
    const calls: Array<{ url: string; body?: string; auth?: string }> = [];
    const keys = await uploadBootDiagnostics({
      bucket: 'cella-boot-diag',
      region: 'nl-ams',
      accessKey: 'access',
      secretKey: 'secret',
      service: 'backend',
      releaseSha: 'abc123',
      bootRc: 1,
      logFile,
      redact: noKnownSecrets,
      now: new Date('2026-06-19T12:00:00Z'),
      fetchImpl: async (url, init) => {
        calls.push({ url, body: init?.body, auth: init?.headers?.Authorization });
        return { ok: true, status: 200, text: async () => '' };
      },
    });
    expect(keys).toEqual([
      'boot-diag/backend-20260619T120000Z-boot.log',
      'boot-diag/backend-failed-20260619T120000Z.log',
    ]);
    expect(calls).toHaveLength(2);
    const first = calls[0]!;
    expect(first.url).toContain(
      'https://cella-boot-diag.s3.nl-ams.scw.cloud/boot-diag/backend-20260619T120000Z-boot.log',
    );
    expect(first.auth).toMatch(/AWS4-HMAC-SHA256 Credential=access\/20260619\/nl-ams\/s3\/aws4_request/);
    expect(first.body).toContain('release=abc123');
    expect(first.body).toContain('hello boot');
  });

  it('uploads only the full log for successful boots', async () => {
    const calls: string[] = [];
    const keys = await uploadBootDiagnostics({
      bucket: 'cella-boot-diag',
      region: 'nl-ams',
      accessKey: 'access',
      secretKey: 'secret',
      service: 'frontend',
      releaseSha: 'abc123',
      bootRc: 0,
      logFile: '/missing/log',
      redact: noKnownSecrets,
      now: new Date('2026-06-19T12:00:00Z'),
      fetchImpl: async (url) => {
        calls.push(url);
        return { ok: true, status: 200, text: async () => '' };
      },
    });
    expect(keys).toEqual(['boot-diag/frontend-20260619T120000Z-boot.log']);
    expect(calls).toHaveLength(1);
  });

  it('appends the captured app logs to the uploaded body', async () => {
    let body = '';
    await uploadBootDiagnostics({
      bucket: 'cella-boot-diag',
      region: 'nl-ams',
      accessKey: 'access',
      secretKey: 'secret',
      service: 'backend',
      releaseSha: 'abc123',
      bootRc: 1,
      logFile: '/missing/log',
      redact: noKnownSecrets,
      appLogs: 'node:internal/modules ... ERR_MODULE_NOT_FOUND',
      now: new Date('2026-06-19T12:00:00Z'),
      fetchImpl: async (_url, init) => {
        body = init?.body ?? '';
        return { ok: true, status: 200, text: async () => '' };
      },
    });
    expect(body).toContain('--- app logs ---');
    expect(body).toContain('ERR_MODULE_NOT_FOUND');
  });

  it('scrubs secret-bearing lines from both the boot log and the app logs before upload', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cella-diag-'));
    const logFile = join(tempDir, 'boot.log');
    await writeFile(logFile, 'boot start\nDATABASE_URL=postgresql://admin:pw@host/db\nboot end', 'utf-8');
    let body = '';
    await uploadBootDiagnostics({
      bucket: 'cella-boot-diag',
      region: 'nl-ams',
      accessKey: 'access',
      secretKey: 'secret',
      service: 'backend',
      releaseSha: 'abc123',
      bootRc: 1,
      logFile,
      redact: noKnownSecrets,
      appLogs: 'crash dump\nCOOKIE_SECRET=abc\nstack trace line',
      now: new Date('2026-06-19T12:00:00Z'),
      fetchImpl: async (_url, init) => {
        body ||= init?.body ?? '';
        return { ok: true, status: 200, text: async () => '' };
      },
    });
    expect(body).toContain('boot start');
    expect(body).toContain('stack trace line');
    expect(body).not.toContain('postgresql://admin');
    expect(body).not.toContain('COOKIE_SECRET=abc');
    expect(body).toContain('[line scrubbed: matched secret pattern]');
  });

  it('must not upload a secret value via the events JSONL, the boot log or the app logs', async () => {
    const dbPassword = 'pg-pw-81f0c2e4aa';
    const dsn = `postgresql://app:${dbPassword}@10.0.0.5:5432/app?sslmode=require`;
    const cookieSecret = 'ck-9d1e77a0b3ff';
    const redactor = createSecretRedactor();
    redactor.add(dsn, cookieSecret);
    tempDir = await mkdtemp(join(tmpdir(), 'cella-diag-'));
    const logFile = join(tempDir, 'boot.log');
    // No line names a secret variable, so only redaction by value can catch these.
    await writeFile(logFile, `boot start\nrelease failed: dial ${dsn}\nboot end`, 'utf-8');
    const bodies: string[] = [];
    await uploadBootDiagnostics({
      bucket: 'cella-boot-diag',
      region: 'nl-ams',
      accessKey: 'access',
      secretKey: 'secret',
      service: 'backend',
      releaseSha: 'abc123',
      bootRc: 1,
      logFile,
      redact: redactor.redact,
      appLogs: `backend  | token ${cookieSecret} rejected\nbackend  | pg auth failed for ${dbPassword}`,
      events: [
        JSON.stringify({ eventName: 'boot.step.failed', body: { stringValue: `release-command FAILED: ${dsn}` } }),
        JSON.stringify({ eventName: 'boot.failed', body: { stringValue: `app log tail: ${cookieSecret}` } }),
      ].join('\n'),
      now: new Date('2026-06-19T12:00:00Z'),
      fetchImpl: async (_url, init) => {
        bodies.push(init?.body ?? '');
        return { ok: true, status: 200, text: async () => '' };
      },
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
    const input = [
      'ok line',
      'MY_API_KEY=xyz',
      'docker login rg.fr-par.scw.cloud',
      'PASSWORD: hunter2',
      'final line',
    ].join('\n');
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
