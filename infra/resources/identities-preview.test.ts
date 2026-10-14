import { beforeAll, describe, expect, it } from 'vitest';
import { installPulumiMocks, type MockHarness } from '../tests/helpers/pulumi-mock';

let h: MockHarness;
/** The first service application the program looks up: the one this preview does not find. */
let missing: string | undefined;

// A registry service whose IAM application does not exist yet, as right after the service was added to the registry: a plan must still render.
beforeAll(async () => {
  h = await installPulumiMocks({
    deferCompute: true,
    preview: true,
    absentApplication: (name) => {
      if (!name.includes('-vm-')) return false;
      missing ??= name;
      return name === missing;
    },
  });
  await import('./identities');
  await h.settle();
});

describe('identities module in a preview', () => {
  it('renders while a registry service has no application yet', () => {
    expect(missing).toBeDefined();
  });

  it('declares no IAM policy: the machine policies are written at Owner moments', () => {
    expect(h.byType('scaleway:iam/policy:Policy')).toEqual([]);
  });
});
