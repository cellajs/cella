import { beforeAll, describe, expect, it } from 'vitest';
import { installPulumiMocks, type MockHarness } from '../tests/helpers/pulumi-mock';

let h: MockHarness;

beforeAll(async () => {
  h = await installPulumiMocks({ deferCompute: true });
  await import('./identities');
  await h.settle();
});

describe('identities module', () => {
  it('must not write IAM: the program declares no policy, as neither the operator key nor the deploy key may', () => {
    expect(h.byType('scaleway:iam/policy:Policy')).toEqual([]);
  });
});

describe('isAbsentApplication', () => {
  it("reads the provider's not-found, and nothing else, as an absent application", async () => {
    const { isAbsentApplication } = await import('./identities');
    const providerNotFound = new Error(
      'invoking scaleway:iam/getApplication:getApplication: 1 error occurred:\n\t* no element found with the name cella-staging-staging-builder',
    );
    expect(isAbsentApplication(providerNotFound)).toBe(true);
    expect(isAbsentApplication(new Error('scaleway-sdk-go: http error 503 Service Unavailable'))).toBe(false);
  });
});
