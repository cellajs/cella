import { beforeAll, describe, expect, it } from 'vitest';
import { installPulumiMocks, type MockHarness } from '../tests/helpers/pulumi-mock';

let h: MockHarness;
/** The first service VM application the program looks up: the one this preview does not find. */
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
  await import('./vm-iam');
  await h.settle();
});

describe('vm-iam module in a preview', () => {
  it('plans the policy of a service whose application is still to be created, on an application id not known yet', () => {
    const slug = missing?.split('-vm-')[1];
    const policy = h.byType('scaleway:iam/policy:Policy').find((candidate) => candidate.name === `vm-${slug}-policy`);
    if (!policy) throw new Error(`no policy planned for ${missing}`);
    expect(typeof policy.inputs.applicationId).not.toBe('string');
    // Its rules are known: they are what the operator reads in the plan.
    expect(policy.inputs.rules).toBeInstanceOf(Array);
  });

  it('keeps the application id of every principal that has one', () => {
    const policies = h.byType('scaleway:iam/policy:Policy');
    expect(policies.length).toBeGreaterThan(1);
    const known = policies.filter((policy) => typeof policy.inputs.applicationId === 'string');
    expect(known).toHaveLength(policies.length - 1);
    for (const policy of known) expect(policy.inputs.applicationId).toMatch(/-id$/);
  });
});
