import { describe, expect, it } from 'vitest';
import { deployRules } from '../lib/scaleway/deploy-policy';
import { SERVICE_SECRET_PERMISSION_SETS } from '../lib/scaleway/permissions';

// The deploy key's rights are plan §3.1's: these tests state what it must never hold.
const FORBIDDEN = ['IAMManager', 'IAMFullAccess', 'ProjectManager', 'OrganizationManager', 'BillingManager', 'BillingFullAccess', 'AccountManager'];
const rules = deployRules({ projectId: 'proj', organizationId: 'org' });
const setsOf = (rule: (typeof rules)[number]) => rule.permission_set_names;

describe('deploy key rights', () => {
  it('must not write IAM or DNS, open a console, or write an image, a snapshot or a security group', () => {
    const all = rules.flatMap(setsOf);
    for (const forbidden of [
      ...FORBIDDEN,
      'IAMApplicationManager',
      'InstancesFullAccess',
      'InstancesServerSerialConsoleAccess',
      'DomainsDNSFullAccess',
    ]) {
      expect(all, forbidden).not.toContain(forbidden);
    }
    expect(all.filter((set) => /^Instances(Image|Snapshot|SecurityGroup)(Create|Write|Delete)$/.test(set))).toEqual([]);
  });

  it("must not read a value of the app's secrets: values in the deploy folder only", () => {
    const valueRules = rules.filter((rule) =>
      rule.permission_set_names.some((set) => set === 'SecretManagerSecretAccess' || set === 'SecretManagerFullAccess'),
    );
    expect(valueRules.map((rule) => rule.condition)).toEqual(['resource.name.startsWith("/deploy/")']);
    expect(rules.flatMap(setsOf)).not.toContain('SecretManagerFullAccess');
  });

  it('reads secret metadata unconditioned: Scaleway refuses a list call under any condition', () => {
    const metadata = rules.filter((rule) => rule.permission_set_names.includes('SecretManagerReadOnly'));
    expect(metadata).toHaveLength(1);
    expect(metadata[0]?.condition).toBeUndefined();
  });

  it("writes secrets in the hand-over folder only: never an app secret, nor the engine's or the deploy folder", () => {
    const writes = rules.filter((rule) => rule.permission_set_names.includes('SecretManagerSecretWrite'));
    expect(writes.map((rule) => rule.condition)).toEqual(['resource.name.startsWith("/handoff/")']);
  });

  it('reads IAM in the organization, and everything else in its own project', () => {
    for (const rule of rules) {
      if (rule.organization_id) expect(rule.permission_set_names).toEqual(['IAMReadOnly']);
      else expect(rule.project_ids).toEqual(['proj']);
    }
  });
});

describe('service VM key permission sets', () => {
  it('SERVICE_SECRET_PERMISSION_SETS exact membership snapshot', () => {
    // Lock service VMs to these read-scoped secret grants; additions require security review.
    // SecretManagerSecretAccess decrypts values without mutation, unlike metadata-only ReadOnly.
    expect([...SERVICE_SECRET_PERMISSION_SETS].sort()).toEqual(['SecretManagerReadOnly', 'SecretManagerSecretAccess']);
  });

  it('every service VM permission set is read-scoped (ReadOnly, or the SecretAccess decrypt-read grant)', () => {
    // SecretManagerSecretAccess reads (decrypts) secret values but grants no
    // write/escalation; everything else must be a plain `ReadOnly` grant.
    for (const p of SERVICE_SECRET_PERMISSION_SETS) {
      expect(p, `service VM permission '${p}' must be ReadOnly or SecretManagerSecretAccess`).toMatch(/(ReadOnly$|^SecretManagerSecretAccess$)/);
    }
  });
});
