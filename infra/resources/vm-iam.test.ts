import { beforeAll, describe, expect, it } from 'vitest';
import { engineConfig } from '../config/engine-config';
import { ruleConditions } from '../lib/scaleway/secret-paths';
import { buildVmAssertRows } from '../lib/scaleway/vm-assert-rows';
import { installPulumiMocks, type MockHarness } from '../tests/helpers/pulumi-mock';

let h: MockHarness;

beforeAll(async () => {
  h = await installPulumiMocks({ deferCompute: true });
  await import('./vm-iam');
  await h.settle();
});

interface PolicyRule {
  permissionSetNames: string[];
  projectIds?: string[];
  organizationId?: string;
  condition?: string;
}

/** A rule that reaches secret values: without its condition, any Secret Manager set reads every secret of the project. */
const readsSecrets = (rule: PolicyRule) => rule.permissionSetNames.some((set) => set.startsWith('SecretManager'));

describe('vm-iam module', () => {
  it('must not let a VM principal read secrets outside its folders: the secret rules carry exactly the parts of the condition the deploy asserts', () => {
    const policies = h.byType('scaleway:iam/policy:Policy');
    // The rows the deploy's assert-vm-grants step compares the live policies with; the CI app has no policy here.
    const rows = buildVmAssertRows(engineConfig()).filter((row) => row.condition !== '');
    expect(rows.length).toBeGreaterThan(1);
    expect(policies).toHaveLength(rows.length);

    for (const row of rows) {
      const policy = policies.find((candidate) => candidate.inputs.applicationId === `${row.app}-id`);
      if (!policy) throw new Error(`no policy for ${row.app}`);
      const rules = policy.inputs.rules as PolicyRule[];
      const secretRules = rules.filter(readsSecrets);
      expect(secretRules.length, policy.name).toBeGreaterThan(0);
      // A condition too large for one rule is spread over several: together they carry every part once, and nothing else.
      expect(
        secretRules.map((rule) => rule.condition),
        policy.name,
      ).toEqual(ruleConditions(row.condition));
      for (const rule of secretRules) {
        const label = `${policy.name} [${rule.permissionSetNames.join(', ')}]`;
        // Project-scoped, as the deploy requires: an organization-scoped rule would cover every project.
        expect(rule.projectIds, label).toHaveLength(1);
        expect(rule.organizationId, label).toBeUndefined();
      }
      // Positive control: the program grants the union of sets the deploy expects, so a matching live policy passes the assertion.
      expect([...new Set(rules.flatMap((rule) => rule.permissionSetNames))].sort(), policy.name).toEqual([...row.sets].sort());
    }
  });
});
