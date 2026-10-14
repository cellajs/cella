import { beforeAll, describe, expect, it } from 'vitest';
import { installPulumiMocks, type MockHarness } from '../tests/helpers/pulumi-mock';

let h: MockHarness;

beforeAll(async () => {
  h = await installPulumiMocks({ deferCompute: true });
  await import('./vm-iam');
  await h.settle();
});

describe('vm-iam module', () => {
  it('must not write IAM: the program declares no policy, as neither the operator key nor the deploy key may', () => {
    expect(h.byType('scaleway:iam/policy:Policy')).toEqual([]);
  });
});
