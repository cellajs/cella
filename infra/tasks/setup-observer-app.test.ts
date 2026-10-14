import { describe, expect, it } from 'vitest';
import { OPERATOR_PROJECT_PERMISSION_SETS } from '../lib/scaleway/permissions';
import { policyReach } from '../lib/scaleway/policy-reach';
import { observerRules } from './setup-observer-app';

const lock = "request.ip in ['203.0.113.7']";
const rules = observerRules({ projectIds: ['proj', 'proj-staging'], organizationId: 'org-1', cidrs: ['203.0.113.7/32'] });

describe('observerRules', () => {
  it('must not grant anything without the IP condition: every rule carries it', () => {
    for (const rule of rules) expect(rule.condition).toBe(lock);
  });

  it('must not write anything: every set it holds reads', () => {
    for (const set of rules.flatMap((rule) => rule.permission_set_names)) expect(set).toMatch(/ReadOnly$/);
  });

  it('must not read a secret value: secret metadata only, and no wider set that could carry the value', () => {
    const sets = rules.flatMap((rule) => rule.permission_set_names);
    expect(sets).toContain('SecretManagerReadOnly');
    expect(sets).not.toContain('SecretManagerSecretAccess');
    expect(sets).not.toContain('AllProductsReadOnly');
  });

  it("reaches the app's projects, and its reach reads back from its rules", () => {
    expect(rules[0]?.project_ids).toEqual(['proj', 'proj-staging']);
    expect(rules[1]).toMatchObject({ permission_set_names: ['IAMReadOnly'], organization_id: 'org-1' });
    expect(policyReach(rules, rules[0]?.permission_set_names ?? [])).toEqual({ projectIds: ['proj', 'proj-staging'], cidrs: ['203.0.113.7/32'] });
  });

  it("is not read as the operator's reach: the two policies name different sets", () => {
    expect(policyReach(rules, OPERATOR_PROJECT_PERMISSION_SETS).projectIds).toEqual([]);
  });
});
