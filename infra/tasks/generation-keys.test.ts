import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { machineKeyDescription, machineKeyName, machinePrincipals } from '../lib/scaleway/machine-keys';
import type { FetchLike } from '../lib/utils/fetch-like';
import { type DeployFolderReads, readGenerationKeys, standingKeyProblem } from './generation-keys';

const slug = 'app';
const mode = 'production';
const principals = machinePrincipals(slug, mode);
const accessKeyOf = (principal: string) => `SCW${principal.toUpperCase().padEnd(17, 'X')}`;

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

/** IAM as a fake: every application exists and holds `keys[application]`; every call's method is recorded. */
function fakeIam(keys: Record<string, string[]>) {
  const methods: string[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    methods.push(init?.method ?? 'GET');
    const params = new URL(url).searchParams;
    if (url.includes('/applications?')) {
      const name = params.get('name') ?? '';
      return json({ applications: [{ id: `id:${name}`, name }] });
    }
    if (url.includes('/api-keys?')) {
      const application = (params.get('application_id') ?? '').replace('id:', '');
      return json({ api_keys: (keys[application] ?? []).map((access_key) => ({ access_key })) });
    }
    return new Response('no mock', { status: 599 });
  };
  return { fetchImpl, methods };
}

/** The deploy folder as a fake: a stored standing key for every principal. */
const secrets: DeployFolderReads = {
  listSecretsUnder: async (root) =>
    root.endsWith('/deploy/')
      ? principals.map(({ principal, application }) => ({
          id: `stored:${principal}`,
          name: machineKeyName(principal),
          path: '/deploy/',
          description: machineKeyDescription(application, accessKeyOf(principal)),
          version_count: 1,
        }))
      : [],
  accessLatestValue: async (id) => JSON.stringify({ accessKey: accessKeyOf(id.replace('stored:', '')), secretKey: `secret-of-${id}` }),
};

const liveAsStored = () => Object.fromEntries(principals.map(({ principal, application }) => [application, [accessKeyOf(principal)]]));

describe('readGenerationKeys', () => {
  const read = (iam: ReturnType<typeof fakeIam>, outFile: string) =>
    readGenerationKeys({
      slug,
      mode,
      services: ['backend', 'cdc'],
      auth: { secretKey: 'deploy', fetchImpl: iam.fetchImpl },
      secrets,
      organizationId: 'org',
      outFile,
    });
  const outFile = () => join(mkdtempSync(join(tmpdir(), 'keys-')), 'keys.json');

  it("writes each running service's standing key for the stack update, and no IAM", async () => {
    const iam = fakeIam(liveAsStored());
    const file = outFile();
    await read(iam, file);
    expect(iam.methods.every((method) => method === 'GET')).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      backend: { accessKey: accessKeyOf('backend'), secretKey: 'secret-of-stored:backend' },
      cdc: { accessKey: accessKeyOf('cdc'), secretKey: 'secret-of-stored:cdc' },
    });
  });

  it('must not give a machine any key while a machine identity holds a key beside its standing one', async () => {
    const live = liveAsStored();
    live['app-production-vm-jobs'] = [accessKeyOf('jobs'), 'SCWPLANTED']; // a dormant one counts too
    await expect(read(fakeIam(live), outFile())).rejects.toThrow(
      /app-production-vm-jobs holds a key no machine is given: SCWPLANTED.*pnpm infra identity/,
    );
  });
});

describe('standingKeyProblem', () => {
  const principal = { principal: 'cdc', application: 'app-production-vm-cdc' };
  it('names a missing, a revoked and an accompanied standing key', () => {
    expect(standingKeyProblem(principal, undefined, [])).toMatch(/no standing key/);
    expect(standingKeyProblem(principal, 'SCWA', ['SCWB'])).toMatch(/no longer live/);
    expect(standingKeyProblem(principal, 'SCWA', ['SCWA', 'SCWB'])).toMatch(/no machine is given: SCWB/);
    expect(standingKeyProblem(principal, 'SCWA', ['SCWA'])).toBeUndefined();
  });
});
