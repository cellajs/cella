import { beforeAll, describe, expect, it } from 'vitest';
import { installPulumiMocks, type MockHarness } from '../tests/helpers/pulumi-mock';

let h: MockHarness;
let looked = false;

// The uploads application before the identity update that makes it, as right after an upgrade that declares it: a plan must still render.
beforeAll(async () => {
  h = await installPulumiMocks({
    deferCompute: true,
    preview: true,
    absentApplication: (name) => {
      if (!name.endsWith('-uploads')) return false;
      looked = true;
      return true;
    },
  });
  await import('./identities');
  await h.settle();
});

describe('identities module in a preview', () => {
  it('renders while the uploads application does not exist yet', () => {
    expect(looked).toBe(true);
  });

  it('declares no IAM policy: the identities are written at Owner moments', () => {
    expect(h.byType('scaleway:iam/policy:Policy')).toEqual([]);
  });
});
