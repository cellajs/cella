import { describe, expect, it } from 'vitest';
import { uploadsPolicy } from '../lib/scaleway/declared-identities';
import { deployRules } from '../lib/scaleway/deploy-policy';

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

  it('must not read a secret value outside the runtime folder: the passphrase and the database passwords stay the operator’s', () => {
    const valueRules = rules.filter((rule) =>
      rule.permission_set_names.some((set) => set === 'SecretManagerSecretAccess' || set === 'SecretManagerFullAccess'),
    );
    expect(valueRules.map((rule) => rule.condition)).toEqual(['resource.name.startsWith("/runtime/")']);
    expect(rules.flatMap(setsOf)).not.toContain('SecretManagerFullAccess');
  });

  it('must not reach the registry: a release travels as archives through links, and no image is pushed or pulled with a key', () => {
    expect(rules.flatMap(setsOf).filter((set) => set.startsWith('ContainerRegistry'))).toEqual([]);
  });

  it('reads secret metadata unconditioned: Scaleway refuses a list call under any condition', () => {
    const metadata = rules.filter((rule) => rule.permission_set_names.includes('SecretManagerReadOnly'));
    expect(metadata).toHaveLength(1);
    expect(metadata[0]?.condition).toBeUndefined();
  });

  it("writes no secret: every app secret is the apply's", () => {
    expect(rules.flatMap(setsOf).filter((set) => /^SecretManagerSecret(Create|Write|Delete)$/.test(set))).toEqual([]);
  });

  it('reads IAM in the organization, and everything else in its own project', () => {
    for (const rule of rules) {
      if (rule.organization_id) expect(rule.permission_set_names).toEqual(['IAMReadOnly']);
      else expect(rule.project_ids).toEqual(['proj']);
    }
  });
});

describe('uploads key rights', () => {
  it('must not do more than object reads, writes and deletes in its own project: no bucket setting, no secret, no machine', () => {
    const { rules: uploads } = uploadsPolicy({ slug: 'app', mode: 'production', projectId: 'proj' });
    expect(uploads).toEqual([
      { permission_set_names: ['ObjectStorageObjectsRead', 'ObjectStorageObjectsWrite', 'ObjectStorageObjectsDelete'], project_ids: ['proj'] },
    ]);
  });
});
