import { beforeAll, describe, expect, it } from 'vitest';
import { engineMadeRuntimeSecrets, runtimeSecrets } from '../lib/runtime-secrets';
import { secretCopies } from '../lib/scaleway/secret-paths';
import { installPulumiMocks, type MockHarness } from '../tests/helpers/pulumi-mock';

let h: MockHarness;
let slug: string;

beforeAll(async () => {
  h = await installPulumiMocks({ deferCompute: true });
  await import('./secrets');
  ({ slug } = (await import('../pulumi-context')).naming);
  await h.settle();
});

const containers = () => h.resources.filter((r) => r.type === 'scaleway:secrets/secret:Secret');
const versions = () => h.resources.filter((r) => r.type === 'scaleway:secrets/version:Version');

describe('secrets module', () => {
  it('files one copy of every runtime secret in the folder of each consumer, never at the root', () => {
    for (const definition of runtimeSecrets) {
      const paths = containers()
        .filter((r) => r.inputs.name === definition.secretName)
        .map((r) => String(r.inputs.path))
        .sort();
      // The machine grants are conditioned on these folders (tests/unit/secret-scope.test.ts proves what each covers).
      expect(paths, definition.id).toEqual(
        secretCopies(definition, slug, 'production')
          .map((copy) => copy.path)
          .sort(),
      );
      for (const path of paths) expect(path).toMatch(new RegExp(`^/${slug}-production/[^/]+/$`));
    }
  });

  it('writes a version only of what a store supplies: never of a generated, derived, database or operator value, which the state must not hold', () => {
    const versioned = new Set(versions().map((r) => r.inputs.secretId));
    const engineMade = new Set(engineMadeRuntimeSecrets().map((definition) => definition.id));
    for (const definition of runtimeSecrets) {
      const storeSupplied = definition.valueSource === 'engine' && !engineMade.has(definition.id);
      for (const container of containers().filter((r) => r.inputs.name === definition.secretName)) {
        expect(versioned.has(`${container.name}-id`), `${definition.id} ${container.name}`).toBe(storeSupplied);
      }
    }
  });

  it('must not hold a generated value in the state: no random value backs a runtime secret', () => {
    const randoms = h.resources.filter((r) => r.type === 'random:index/randomPassword:RandomPassword').map((r) => r.name);
    expect(randoms.filter((name) => name.startsWith('generated-'))).toEqual([]);
    expect(
      versions()
        .map((r) => r.name)
        .filter((name) => name.includes('yjs-token')),
    ).toEqual([]);
  });
});
