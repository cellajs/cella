import { describe, expect, it } from 'vitest';
import { makeFetch } from '../../tests/helpers/fake-fetch';
import { extendPolicyReach, type PolicyReach } from './policy-reach';

const condition = "request.ip in ['51.15.82.207']";
const sets = ['ServerlessJobsFullAccess', 'ContainerRegistryReadOnly'] as const;
const rules = ({ projectIds, condition: shared }: PolicyReach) => [{ permission_set_names: sets, project_ids: projectIds, condition: shared }];

/** A policy named `runner-policy` whose one rule holds `held` on project `p1`, and what a rewrite sends. */
function policyHolding(held: readonly string[]) {
  return makeFetch([
    { method: 'GET', match: '/policies?', body: { policies: [{ id: 'pol', name: 'runner-policy' }] } },
    { method: 'GET', match: '/rules?policy_id=pol', body: { rules: [{ permission_set_names: held, project_ids: ['p1'], condition }] } },
    { method: 'PUT', match: '/rules', body: {} },
  ]);
}

const extend = (fetchImpl: ReturnType<typeof makeFetch>['fn']) =>
  extendPolicyReach({
    auth: { secretKey: 'owner', fetchImpl },
    organizationId: 'org',
    policyName: 'runner-policy',
    projectSets: sets,
    projectIds: ['p1'],
    rules,
  });

describe('extendPolicyReach', () => {
  it("rewrites a policy that covers the projects but lacks a declared set: the runner's start of the engine image was refused 403 without the registry set", async () => {
    const { fn, calls } = policyHolding(['ServerlessJobsFullAccess']);

    expect(await extend(fn)).toBe('extended');
    const put = calls.find((call) => call.init.method === 'PUT');
    expect(JSON.parse(String(put?.init.body))).toEqual({
      policy_id: 'pol',
      rules: [{ permission_set_names: [...sets], project_ids: ['p1'], condition }],
    });
  });

  it('leaves a policy that covers the projects and holds every declared set', async () => {
    const { fn, calls } = policyHolding(sets);

    expect(await extend(fn)).toBe('unchanged');
    expect(calls.some((call) => call.init.method === 'PUT')).toBe(false);
  });
});
