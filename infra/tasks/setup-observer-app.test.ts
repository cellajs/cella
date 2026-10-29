import { describe, expect, it } from 'vitest';
import { sameRules } from '../lib/scaleway/machine-policies';
import { OBSERVER_PROJECT_PERMISSION_SETS, OPERATOR_PROJECT_PERMISSION_SETS } from '../lib/scaleway/permissions';
import { policyReach } from '../lib/scaleway/policy-reach';
import { observerPolicy, observerRules } from './setup-observer-app';

const rules = observerRules({ projectIds: ['proj', 'proj-staging'], organizationId: 'org-1' });
const sets = rules.flatMap((rule) => rule.permission_set_names);

describe('observerRules', () => {
  it('must not read a key in the clear, as it works from any address: no machine user data, no image, no secret value', () => {
    for (const rule of rules) expect(rule.condition).toBeUndefined();
    expect(sets.filter((set) => /^(Instances|ContainerRegistry|AllProducts)/.test(set))).toEqual([]);
    expect(sets).toContain('SecretManagerReadOnly');
    expect(sets).not.toContain('SecretManagerSecretAccess');
  });

  it('must not write anything: every set it holds reads', () => {
    for (const set of sets) expect(set).toMatch(/ReadOnly$/);
  });

  it("reaches the app's projects, and its reach reads back from its rules", () => {
    expect(rules[0]?.project_ids).toEqual(['proj', 'proj-staging']);
    expect(rules[1]).toMatchObject({ permission_set_names: ['IAMReadOnly'], organization_id: 'org-1' });
    expect(policyReach(rules, OBSERVER_PROJECT_PERMISSION_SETS)).toEqual({ projectIds: ['proj', 'proj-staging'], cidrs: [] });
  });

  it("is not read as the operator's reach: the two policies name different sets", () => {
    expect(policyReach(rules, OPERATOR_PROJECT_PERMISSION_SETS).projectIds).toEqual([]);
  });

  it('has the rules of an observer locked to an address with machine and image reads replaced, keeping its reach', () => {
    const lock = "request.ip in ['203.0.113.7']";
    const locked = [
      {
        permission_set_names: [...OBSERVER_PROJECT_PERMISSION_SETS, 'InstancesReadOnly', 'ContainerRegistryReadOnly'],
        project_ids: ['proj', 'proj-staging'],
        condition: lock,
      },
      { permission_set_names: ['IAMReadOnly'], organization_id: 'org-1', condition: lock },
    ];
    const reach = policyReach(locked, OBSERVER_PROJECT_PERMISSION_SETS).projectIds;
    const declared = observerPolicy({ slug: 'app', organizationId: 'org-1', projectIds: [...reach, 'proj'] });
    expect(declared.name).toBe('app-observer-policy');
    expect(sameRules(locked, declared.rules)).toBe(false);
    expect(sameRules(rules, declared.rules)).toBe(true);
  });
});
