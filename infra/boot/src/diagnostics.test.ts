import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scrubSecretLines, uploadBootDiagnostics } from './diagnostics';

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
