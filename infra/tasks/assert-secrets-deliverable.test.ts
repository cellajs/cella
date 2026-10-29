import { describe, expect, it } from 'vitest';
import { MAIN_JOB_EXIT } from '../lib/deploy/main-job';
import { ExitCodeError } from '../lib/utils/errors';
import type { FetchLike } from '../lib/utils/fetch-like';
import { assertSecretsDeliverable, blockOnMissing, type SecretToCheck, serviceNamesFromServicesJson } from './assert-secrets-deliverable';

const REGION = 'fr-par';
const PROJECT = 'proj-1';
const KEY = 'scw-secret-key';

interface ListedSecret {
  name: string;
  path?: string;
  version_count: number;
}

/**
 * A fetch double that serves only the Secret Manager list call, filtered by name, and records every URL it was asked for. Any other call (a
 * value read) fails the test: the check is metadata only.
 */
function fakeFetch(listed: ListedSecret[]): { fetchImpl: FetchLike; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    urls.push(url);
    if (!url.includes('/secrets?')) throw new Error(`unexpected call: ${url}`);
    const name = decodeURIComponent(new URL(url).searchParams.get('name') ?? '');
    const body = JSON.stringify({ secrets: listed.filter((secret) => secret.name === name).map((secret, i) => ({ id: `id-${i}`, ...secret })) });
    return { ok: true, status: 200, text: async () => body };
  };
  return { fetchImpl, urls };
}

const silent = () => {};

describe('assertSecretsDeliverable', () => {
  it('passes when every required copy holds a version, without reading a value', async () => {
    const secrets: SecretToCheck[] = [
      { envVar: 'DATABASE_URL', secretName: 'database-url', required: true },
      { envVar: 'DATABASE_SSL_CA', secretName: 'database-ssl-ca', required: true },
    ];
    const { fetchImpl, urls } = fakeFetch([
      { name: 'database-url', version_count: 2 },
      { name: 'database-ssl-ca', version_count: 1 },
    ]);
    const res = await assertSecretsDeliverable({ secretKey: KEY, region: REGION, projectId: PROJECT, secrets, log: silent, fetchImpl });
    expect(res.ok).toBe(true);
    expect(res.checked).toBe(2);
    expect(res.offenders).toEqual([]);
    expect(urls.every((url) => !url.includes('/versions/'))).toBe(true);
  });

  it('flags a required container with no version', async () => {
    const { fetchImpl } = fakeFetch([{ name: 'cookie-secret', version_count: 0 }]);
    const res = await assertSecretsDeliverable({
      secretKey: KEY,
      region: REGION,
      projectId: PROJECT,
      secrets: [{ envVar: 'COOKIE_SECRET', secretName: 'cookie-secret', required: true }],
      log: silent,
      fetchImpl,
    });
    expect(res.offenders).toEqual([{ envVar: 'COOKIE_SECRET', secretName: 'cookie-secret', reason: 'missing' }]);
  });

  it('flags a missing required secret but skips a missing optional one', async () => {
    const { fetchImpl, urls } = fakeFetch([]);
    const res = await assertSecretsDeliverable({
      secretKey: KEY,
      region: REGION,
      projectId: PROJECT,
      secrets: [
        { envVar: 'COOKIE_SECRET', secretName: 'cookie-secret', required: true },
        { envVar: 'OPENAI_API_KEY', secretName: 'openai-api-key', required: false },
      ],
      log: silent,
      fetchImpl,
    });
    expect(res.ok).toBe(false);
    expect(res.offenders).toEqual([{ envVar: 'COOKIE_SECRET', secretName: 'cookie-secret', reason: 'missing' }]);
    // An optional secret is not even probed.
    expect(urls).toHaveLength(1);
  });
});

describe('a missing required secret', () => {
  it('ends the deploy blocked, the exit code the runner and the apply read, naming the secret and the action that stores it (D-g)', async () => {
    const { fetchImpl } = fakeFetch([]);
    const result = await assertSecretsDeliverable({
      secretKey: KEY,
      region: REGION,
      projectId: PROJECT,
      secrets: [{ envVar: 'ADMIN_EMAIL', secretName: 'admin-email', required: true, path: '/backend/' }],
      log: silent,
      fetchImpl,
    });
    const blocked = (() => {
      try {
        blockOnMissing(result);
      } catch (error) {
        return error;
      }
    })();
    expect(blocked).toBeInstanceOf(ExitCodeError);
    expect(blocked).toMatchObject({ exitCode: MAIN_JOB_EXIT.blocked });
    expect((blocked as Error).message).toContain('admin-email');
    expect((blocked as Error).message).toContain('pnpm infra secrets');
  });
});

describe('serviceNamesFromServicesJson', () => {
  it('extracts known service names and drops unknown rows', () => {
    const raw = JSON.stringify([{ service: 'backend' }, { service: 'bogus' }, { service: 'frontend' }]);
    expect(serviceNamesFromServicesJson(raw)).toEqual(['backend', 'frontend']);
  });
});

describe('assertSecretsDeliverable, one copy per consumer', () => {
  it('reads the copy in the given folder, not another copy of the same name', async () => {
    // Only the backend copy has a version: the jobs copy is empty and must be reported.
    const { fetchImpl } = fakeFetch([
      { name: 'brevo-api-key', path: '/backend', version_count: 1 },
      { name: 'brevo-api-key', path: '/jobs', version_count: 0 },
    ]);
    const res = await assertSecretsDeliverable({
      secretKey: 'k',
      region: 'nl-ams',
      projectId: 'p',
      secrets: [
        { envVar: 'BREVO_API_KEY', secretName: 'brevo-api-key', required: true, path: '/backend/' },
        { envVar: 'BREVO_API_KEY', secretName: 'brevo-api-key', required: true, path: '/jobs/' },
      ],
      fetchImpl,
      log: () => {},
    });
    expect(res.offenders).toEqual([{ envVar: 'BREVO_API_KEY', secretName: 'brevo-api-key', path: '/jobs/', reason: 'missing' }]);
  });
});
