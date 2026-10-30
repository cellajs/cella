import { describe, expect, it } from 'vitest';
import { fakeConfig } from '../../tests/helpers/fake-config';
import { principalSecretCondition } from '../runtime-secrets';
import { principalServices } from '../services';
import { machinePolicies, sameRules } from './machine-policies';
import { principalNames } from './principals';
import { ruleConditions } from './secret-paths';

const readsSecrets = (sets: readonly string[]) => sets.some((set) => set.startsWith('SecretManager'));

describe('machinePolicies', () => {
  for (const singleVM of [true, false]) {
    it(`must not let a machine read secrets outside its folders (singleVM ${singleVM})`, () => {
      const config = fakeConfig({ singleVM });
      const names = principalNames(config.slug, config.mode);
      const policies = machinePolicies(config, 'project-1');
      for (const policy of policies) {
        for (const rule of policy.rules) {
          // Project-scoped: an organization-scoped rule would reach every project.
          expect(rule.project_ids, policy.name).toEqual(['project-1']);
          expect(rule.organization_id, policy.name).toBeUndefined();
        }
        const secretConditions = policy.rules.filter((rule) => readsSecrets(rule.permission_set_names)).map((rule) => rule.condition);
        const service = principalServices().find((svc) => names.vmService(svc.slug) === policy.applicationName);
        if (service) expect(secretConditions, policy.name).toEqual(ruleConditions(principalSecretCondition(service.slug)));
        else expect(secretConditions, policy.name).toEqual([]);
      }
      expect(policies.map((policy) => policy.applicationName)).toEqual([
        ...principalServices().map((svc) => names.vmService(svc.slug)),
        names.builder,
      ]);
    });
  }
});

describe('sameRules', () => {
  const wanted = [
    { permission_set_names: ['B', 'A'], project_ids: ['p'], condition: 'x' },
    { permission_set_names: ['C'], project_ids: ['p'] },
  ];

  it('takes rules in any order, sets in any order, and an absent condition as an empty one', () => {
    expect(
      sameRules(
        [
          { permission_set_names: ['C'], project_ids: ['p'], condition: '' },
          { permission_set_names: ['A', 'B'], project_ids: ['p'], condition: 'x', organization_id: null },
        ],
        wanted,
      ),
    ).toBe(true);
  });

  it('must not pass a rule that is missing, extra, or conditioned otherwise', () => {
    expect(sameRules([{ permission_set_names: ['A', 'B'], project_ids: ['p'], condition: 'x' }], wanted)).toBe(false);
    expect(sameRules([...wanted, { permission_set_names: ['D'], project_ids: ['p'] }], wanted)).toBe(false);
    expect(sameRules([{ ...wanted[0], condition: 'y' }, wanted[1]] as never, wanted)).toBe(false);
  });
});
