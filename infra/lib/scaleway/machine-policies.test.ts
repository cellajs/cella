import { describe, expect, it } from 'vitest';
import { fakeConfig } from '../../tests/helpers/fake-config';
import { machinePolicies, sameRules } from './machine-policies';
import { ruleConditions } from './secret-paths';
import { buildVmAssertRows } from './vm-assert-rows';

const readsSecrets = (sets: readonly string[]) => sets.some((set) => set.startsWith('SecretManager'));

describe('machinePolicies', () => {
  for (const singleVM of [true, false]) {
    it(`must not let a machine read secrets outside its folders (singleVM ${singleVM}): each policy carries exactly what the deploy asserts`, () => {
      const config = fakeConfig({ singleVM });
      const policies = machinePolicies(config, 'project-1');
      // The rows the deploy's assert-vm-grants step compares the live policies with; the CI application has no machine policy.
      const rows = buildVmAssertRows(config).filter((row) => row.condition !== '');
      expect(policies).toHaveLength(rows.length);
      for (const row of rows) {
        const policy = policies.find((candidate) => candidate.applicationName === row.app);
        if (!policy) throw new Error(`no policy for ${row.app}`);
        const secretRules = policy.rules.filter((rule) => readsSecrets(rule.permission_set_names));
        expect(
          secretRules.map((rule) => rule.condition),
          policy.name,
        ).toEqual(ruleConditions(row.condition));
        for (const rule of policy.rules) {
          // Project-scoped, as the deploy requires: an organization-scoped rule would reach every project.
          expect(rule.project_ids, policy.name).toEqual(['project-1']);
          expect(rule.organization_id, policy.name).toBeUndefined();
        }
        expect([...new Set(policy.rules.flatMap((rule) => rule.permission_set_names))].sort(), policy.name).toEqual([...row.sets].sort());
      }
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
