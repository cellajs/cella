import { beforeAll, describe, expect, it } from 'vitest';
import { installPulumiMocks, type MockHarness } from '../../tests/helpers/pulumi-mock';
import type { KeptResource } from './kept-resources';

let h: MockHarness;
let kept: KeptResource[];
let mod: typeof import('./kept-resources');

beforeAll(async () => {
  h = await installPulumiMocks();
  await import('../../resources/storage');
  await import('../../resources/secrets');
  await import('../../resources/state-bucket-policy');
  await h.settle();
  mod = await import('./kept-resources');
  const { engineConfig } = await import('../../config/engine-config');
  kept = mod.keptResources(engineConfig);
});

const exportOf = (...names: string[]) => ({
  deployment: { resources: names.map((name) => ({ urn: `urn:pulumi:production::infra::${name}` })) },
});
const adoptedBucket = (resource: KeptResource) => (resource.adopt && 'bucket' in resource.adopt ? resource.adopt.bucket : undefined);
const adoptedSecret = (resource: KeptResource) => (resource.adopt && 'secret' in resource.adopt ? resource.adopt.secret : undefined);

describe('the kept set', () => {
  it('names only resources the program declares, by type and name: an import under any other would leave the first `up` to delete it', () => {
    const declared = new Set(h.resources.map((resource) => `${resource.type}::${resource.name}`));
    for (const resource of kept) expect(declared, resource.name).toContain(`${resource.type}::${resource.name}`);
  });

  it("keeps no value a person pastes or a rotation replaces, and deletes no container outside the engine's folders", async () => {
    const { runtimeSecrets } = await import('../runtime-secrets');
    const secrets = kept.flatMap((resource) => adoptedSecret(resource) ?? []);
    expect(secrets.length).toBeGreaterThan(0);
    for (const name of secrets) {
      const definition = runtimeSecrets.find((candidate) => candidate.secretName === name);
      expect(definition?.valueSource, name).toBe('engine');
      expect(definition?.rotatable, name).not.toBe(true);
    }
    const { engineConfig } = await import('../../config/engine-config');
    const listed = [
      { id: 'kept', name: secrets[0] ?? '', path: '/runtime' },
      { id: 'elsewhere', name: secrets[0] ?? '', path: '/engine' },
      { id: 'cookie', name: 'cookie-secret', path: '/runtime' },
      { id: 'copy', name: 'cookie-secret', path: '/shared/backend/jobs' },
      { id: 'foreign', name: 'cookie-secret', path: '/someone-elses' },
    ];
    expect(mod.sweptSecrets(listed, kept, mod.engineFolders(engineConfig)).map((secret) => secret.id)).toEqual(['elsewhere', 'cookie', 'copy']);
  });

  it('readies a state for the destroy whatever an older program recorded: the kept resources leave it, every other bucket empties on delete', () => {
    const keptBucket = kept.find((resource) => adoptedBucket(resource));
    const urn = (type: string, name: string) => `urn:pulumi:production::infra::${type}::${name}`;
    const frontend = { urn: urn('scaleway:object/bucket:Bucket', 'frontend-bucket'), type: 'scaleway:object/bucket:Bucket' };
    const ready = mod.destroyableState(
      {
        deployment: {
          resources: [
            { urn: urn(keptBucket?.type ?? '', keptBucket?.name ?? ''), type: keptBucket?.type },
            { ...frontend, inputs: { name: 'f', forceDestroy: false }, outputs: { name: 'f', forceDestroy: false } },
            { urn: urn('scaleway:databases/instance:Instance', 'main-postgres'), type: 'scaleway:databases/instance:Instance', inputs: {} },
          ],
        },
      },
      kept,
    );
    expect([ready.kept, ready.emptied]).toEqual([[keptBucket?.name], ['frontend-bucket']]);
    expect(ready.document).toMatchObject({
      deployment: {
        resources: [
          { ...frontend, inputs: { forceDestroy: true }, outputs: { forceDestroy: true } },
          { type: 'scaleway:databases/instance:Instance', inputs: {} },
        ],
      },
    });
  });
});

describe('importPlan', () => {
  const region = 'nl-ams';
  const live = () => ({
    buckets: [...kept.flatMap((resource) => adoptedBucket(resource) ?? []), 'another-app-bucket'],
    secrets: kept.flatMap((resource) => {
      const name = adoptedSecret(resource);
      return name ? [{ id: `${name}-uuid`, name, path: '/runtime/' }] : [];
    }),
  });

  it('adopts every kept bucket and container into a fresh stack, under the name the program declares; a bucket policy the `up` writes anew', () => {
    const plan = mod.importPlan(kept, live(), exportOf(), region);
    expect(plan).toEqual(
      kept.flatMap((resource) => {
        const bucket = adoptedBucket(resource);
        const secret = adoptedSecret(resource);
        if (bucket) return [{ type: resource.type, name: resource.name, id: `${region}/${bucket}` }];
        return secret ? [{ type: resource.type, name: resource.name, id: `${region}/${secret}-uuid` }] : [];
      }),
    );
    expect(plan.some((resource) => resource.type.includes('bucketPolicy'))).toBe(false);
  });

  it('must not import what the state holds already, what is gone, or a container of the kept name in another folder', () => {
    const [first, ...rest] = kept.filter((resource) => resource.adopt);
    const missing = rest.find((resource) => adoptedBucket(resource));
    const moved = rest.find((resource) => adoptedSecret(resource));
    const state = live();
    const plan = mod.importPlan(
      kept,
      {
        buckets: state.buckets.filter((bucket) => bucket !== (missing && adoptedBucket(missing))),
        secrets: state.secrets.map((secret) => (secret.name === (moved && adoptedSecret(moved)) ? { ...secret, path: '/engine/' } : secret)),
      },
      exportOf(`${first?.type}::${first?.name}`),
      region,
    );
    const skipped = [first, missing, moved].flatMap((resource) => resource?.name ?? []);
    const names = plan.map((resource) => resource.name);
    for (const name of skipped) expect(names).not.toContain(name);
    expect(names.length).toBe(kept.filter((resource) => resource.adopt).length - skipped.length);
  });
});
