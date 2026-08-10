import { describe, expect, it } from 'vitest';
import {
  ORG_PERMISSION_SETS,
  PROJECT_PERMISSION_SETS,
  SERVICE_SECRET_PERMISSION_SETS,
} from '../lib/scaleway/permissions';

// Exact snapshots make every CI privilege change reviewable. Explicit forbidden
// permissions prevent the key from gaining IAM authority to escalate itself.
const FORBIDDEN = [
  'IAMManager',
  'IAMFullAccess',
  'ProjectManager',
  'OrganizationManager',
  'BillingManager',
  'BillingFullAccess',
  'AccountManager',
];

describe('CI key permission sets', () => {
  it('PROJECT_PERMISSION_SETS exact membership snapshot', () => {
    expect([...PROJECT_PERMISSION_SETS].sort()).toEqual([
      'BlockStorageFullAccess',
      'ContainerRegistryFullAccess',
      'IPAMFullAccess',
      'InstancesFullAccess',
      'LoadBalancersFullAccess',
      'ObjectStorageFullAccess',
      'PrivateNetworksFullAccess',
      'RelationalDatabasesReadOnly',
      'SecretManagerFullAccess',
      'VPCReadOnly',
    ]);
  });

  it('ORG_PERMISSION_SETS exact membership snapshot', () => {
    // IAMReadOnly: org-scoped IAM *read* so `pulumi up` (helpers.ts) and the
    // deploy's "Verify VM reader IAM grant" step can look up applications/
    // policies by name. Read-only: IAMManager/IAMFullAccess remain FORBIDDEN.
    expect([...ORG_PERMISSION_SETS].sort()).toEqual(['DomainsDNSFullAccess', 'IAMReadOnly']);
  });

  it('does not include any privilege-escalation permission', () => {
    const all = [...PROJECT_PERMISSION_SETS, ...ORG_PERMISSION_SETS];
    for (const forbidden of FORBIDDEN) {
      expect(all, `permission set '${forbidden}' must not be granted to the CI key`).not.toContain(forbidden);
    }
  });

  it('every project permission set ends with FullAccess or ReadOnly', () => {
    // Catches typos like `InstancesFullAcess` early.
    for (const p of PROJECT_PERMISSION_SETS) {
      expect(p, `permission '${p}' must end in FullAccess or ReadOnly`).toMatch(/(FullAccess|ReadOnly)$/);
    }
  });
});

describe('service VM key permission sets', () => {
  it('SERVICE_SECRET_PERMISSION_SETS exact membership snapshot', () => {
    // Lock service VMs to these read-scoped secret grants; additions require security review.
    // SecretManagerSecretAccess decrypts values without mutation, unlike metadata-only ReadOnly.
    expect([...SERVICE_SECRET_PERMISSION_SETS].sort()).toEqual(['SecretManagerReadOnly', 'SecretManagerSecretAccess']);
  });

  it('does not include any write or privilege-escalation permission', () => {
    const all = [...SERVICE_SECRET_PERMISSION_SETS];
    for (const forbidden of [...FORBIDDEN, 'FullAccess', 'InstancesFullAccess', 'LoadBalancersFullAccess']) {
      expect(all, `service VM key must not hold '${forbidden}'`).not.toContain(forbidden);
    }
  });

  it('every service VM permission set is read-scoped (ReadOnly, or the SecretAccess decrypt-read grant)', () => {
    // SecretManagerSecretAccess reads (decrypts) secret values but grants no
    // write/escalation; everything else must be a plain `ReadOnly` grant.
    for (const p of SERVICE_SECRET_PERMISSION_SETS) {
      expect(p, `service VM permission '${p}' must be ReadOnly or SecretManagerSecretAccess`).toMatch(
        /(ReadOnly$|^SecretManagerSecretAccess$)/,
      );
    }
  });
});
