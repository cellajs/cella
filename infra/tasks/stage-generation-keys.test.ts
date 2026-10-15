import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { machineKeyDescription, machineKeyName, machinePrincipals } from '../lib/scaleway/machine-keys';
import type { SecretManagerSecret } from '../lib/scaleway/scaleway-secret-manager';
import type { FetchLike } from '../lib/utils/fetch-like';
import { type StageSecrets, stageGenerationKeys, standingKeyProblem } from './stage-generation-keys';

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

/** The deploy folder as a fake: a stored standing key for every principal; bundles and deletes are recorded. */
function fakeSecrets() {
  const staged: Array<{ name: string; value: string }> = [];
  const stored: SecretManagerSecret[] = principals.map(({ principal, application }) => ({
    id: `stored:${principal}`,
    name: machineKeyName(principal),
    path: `/${slug}-${mode}/deploy/`,
    description: machineKeyDescription(application, accessKeyOf(principal)),
    version_count: 1,
  }));
  const bundles = new Map<string, string>();
  const secrets: StageSecrets = {
    listSecretsUnder: async (root) => (root.endsWith('/deploy/') ? stored : []),
    accessLatestValue: async (id) => JSON.stringify({ accessKey: accessKeyOf(id.replace('stored:', '')), secretKey: `secret-of-${id}` }),
    ensureSecret: async (input) => {
      bundles.set(`bundle:${input.name}`, input.name);
      return { id: `bundle:${input.name}`, name: input.name, path: input.path };
    },
    putSecretValue: async (input) => {
      staged.push({ name: bundles.get(input.secretId) ?? '', value: input.value });
      return {};
    },
    deleteSecret: async () => {},
  };
  return { secrets, staged };
}

const liveAsStored = () => Object.fromEntries(principals.map(({ principal, application }) => [application, [accessKeyOf(principal)]]));

describe('stageGenerationKeys', () => {
  it('hands over each running service its standing key and bakes the boot key, without writing IAM', async () => {
    const iam = fakeIam(liveAsStored());
    const { secrets, staged } = fakeSecrets();
    const outFile = join(mkdtempSync(join(tmpdir(), 'stage-')), 'keys.json');
    const result = await stageGenerationKeys({
      slug,
      mode,
      sha: 'abcdef0123456789',
      services: ['backend', 'cdc'],
      auth: { secretKey: 'deploy', fetchImpl: iam.fetchImpl },
      secrets,
      organizationId: 'org',
      outFile,
      log: () => {},
    });
    expect(iam.methods.every((method) => method === 'GET')).toBe(true);
    expect(staged.map((entry) => entry.name)).toEqual(['handoff-backend-abcdef0123', 'handoff-cdc-abcdef0123']);
    expect(JSON.parse(staged[1]?.value ?? '{}')).toEqual({ accessKey: accessKeyOf('cdc'), secretKey: 'secret-of-stored:cdc' });
    expect(result.bootAccessKey).toBe(accessKeyOf('boot'));
    // Keyed by service and release: a machine of another release finds no bundle.
    expect(JSON.parse(readFileSync(outFile, 'utf8')).handoffSecretIds).toEqual({
      'backend@abcdef0123456789': 'bundle:handoff-backend-abcdef0123',
      'cdc@abcdef0123456789': 'bundle:handoff-cdc-abcdef0123',
    });
  });

  it('must not hand anything over while a machine identity holds a key beside its standing one', async () => {
    const live = liveAsStored();
    live['app-production-vm-jobs'] = [accessKeyOf('jobs'), 'SCWPLANTED']; // a dormant one counts too
    const { secrets, staged } = fakeSecrets();
    await expect(
      stageGenerationKeys({
        slug,
        mode,
        sha: 'abcdef0123456789',
        services: ['backend'],
        auth: { secretKey: 'deploy', fetchImpl: fakeIam(live).fetchImpl },
        secrets,
        organizationId: 'org',
        outFile: join(mkdtempSync(join(tmpdir(), 'stage-')), 'keys.json'),
        log: () => {},
      }),
    ).rejects.toThrow(/app-production-vm-jobs holds a key nobody hands over: SCWPLANTED.*pnpm infra identity/);
    expect(staged).toEqual([]);
  });
});

describe('standingKeyProblem', () => {
  const principal = { principal: 'cdc', application: 'app-production-vm-cdc' };
  it('names a missing, a revoked and an accompanied standing key', () => {
    expect(standingKeyProblem(principal, undefined, [])).toMatch(/no standing key/);
    expect(standingKeyProblem(principal, 'SCWA', ['SCWB'])).toMatch(/no longer live/);
    expect(standingKeyProblem(principal, 'SCWA', ['SCWA', 'SCWB'])).toMatch(/nobody hands over: SCWB/);
    expect(standingKeyProblem(principal, 'SCWA', ['SCWA'])).toBeUndefined();
  });
});
