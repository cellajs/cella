// CI deploy key (`<slug>-ci-deploy`): project scope

/** Permission sets granted to the CI deploy key at project scope. The `…ReadOnly` entries are bootstrap-owned: CI refreshes but may not mutate them. */
export const PROJECT_PERMISSION_SETS = [
  // Write: touched by routine CI deploys.
  'BlockStorageFullAccess', // block volumes attached to instances (split from InstancesFullAccess upstream)
  'ContainerRegistryFullAccess', // image push
  'IPAMFullAccess', // reserve + attach stable private IPAM IPs for VMs
  'InstancesFullAccess', // VM lifecycle
  'LoadBalancersFullAccess', // backend/frontend re-pointing
  'ObjectStorageFullAccess', // frontend bucket uploads, policy refresh
  'PrivateNetworksFullAccess', // VM PN attachments (write required by InstancesFullAccess replacements)
  'SecretManagerFullAccess', // secret version rotation
  // Read-only: bootstrap-owned, refreshed but not mutated by CI.
  'VPCReadOnly',
  'RelationalDatabasesReadOnly',
] as const;

// CI deploy key: grants beyond the app project

/** DNS permission set, "Scoped by Project" on Scaleway. The CI key gets it project-scoped (app project plus the serving zone's project) so it cannot touch unrelated zones. */
export const DNS_PERMISSION_SETS = ['DomainsDNSFullAccess'] as const;

/** Organization-scoped sets: IAMReadOnly lets `pulumi up` look up applications by name. A single IAM policy rule may hold permission sets of only ONE scope type, so this needs its own org-keyed rule. */
export const ORG_SCOPED_PERMISSION_SETS = ['IAMReadOnly'] as const;

/** Audit union of the CI grants beyond the plain app-project rule (rule-agnostic). */
export const ORG_PERMISSION_SETS = [...DNS_PERMISSION_SETS, ...ORG_SCOPED_PERMISSION_SETS] as const;

// Admin app (`<slug>-<mode>-admin`): the standing human principal

/**
 * Project-scoped sets for the admin application, the principal a human authenticates as for day-2 operations.
 * Object Storage is the only write (bucket policies are deny-by-default, so admin needs the IAM allow AND the bucket-policy statement); everything else is read-only, with no IAM write.
 */
export const ADMIN_PROJECT_PERMISSION_SETS = [
  'ObjectStorageFullAccess', // bucket reads/refresh + state-bucket recovery (s3:* comes from bucket policies)
  'BlockStorageReadOnly',
  'ContainerRegistryReadOnly',
  'DomainsDNSReadOnly',
  'IPAMReadOnly',
  'InstancesReadOnly',
  'LoadBalancersReadOnly',
  'PrivateNetworksReadOnly',
  'RelationalDatabasesReadOnly',
  'SecretManagerReadOnly',
  'VPCReadOnly',
] as const;

/** Org-scoped admin sets: IAM reads so `pulumi preview` can resolve principals by name. */
export const ADMIN_ORG_PERMISSION_SETS = ['IAMReadOnly'] as const;

// Per-service model (P3): service, boot, and CI key-mint grants

/** Secret-value read sets, always paired with a resource-level path condition. SecretManagerReadOnly alone is metadata-only and 403s the sync; SecretManagerSecretAccess decrypts the values. */
export const SERVICE_SECRET_PERMISSION_SETS = ['SecretManagerReadOnly', 'SecretManagerSecretAccess'] as const;

/** Backend service app S3 signing sets for attachment uploads and presigned URLs. Granular object sets, NOT FullAccess; bucket policies scope which buckets. */
export const BACKEND_S3_PERMISSION_SETS = [
  'ObjectStorageObjectsRead',
  'ObjectStorageObjectsWrite',
  'ObjectStorageObjectsDelete',
] as const;

/** Boot application sets: pull images and write boot diagnostics. Its Secret Manager rule is separate and conditioned to the handoff folder (bootKeyCondition). */
export const BOOT_PROJECT_PERMISSION_SETS = ['ContainerRegistryReadOnly', 'ObjectStorageObjectsWrite'] as const;

/**
 * CI key-mint grant. Must stay unconditioned: an api-key POST carries no `resource.id`, so a `resource.id in [<app ids>]` condition 403s even for a listed app.
 * Accepted widening: CI can manage applications and api-keys org-wide; the boundary is the absent IAMPolicyManager, so CI cannot grant permissions.
 */
export const CI_KEY_MINT_PERMISSION_SETS = ['IAMApplicationManager'] as const;

/** The CI policy's per-rule shape, shared by the rule builder and the drift check so the two cannot diverge. Every CI rule is unconditioned; a condition on any CI rule is drift. */
export interface CiRuleShape {
  id: 'project' | 'dns' | 'org-read' | 'key-mint';
  scope: 'project' | 'dns-projects' | 'organization';
  permissionSets: readonly string[];
}
export const CI_RULE_SHAPES: readonly CiRuleShape[] = [
  { id: 'project', scope: 'project', permissionSets: PROJECT_PERMISSION_SETS },
  { id: 'dns', scope: 'dns-projects', permissionSets: DNS_PERMISSION_SETS },
  { id: 'org-read', scope: 'organization', permissionSets: ORG_SCOPED_PERMISSION_SETS },
  { id: 'key-mint', scope: 'organization', permissionSets: CI_KEY_MINT_PERMISSION_SETS },
];

/**
 * Resource-token fragments that are bootstrap-owned and NOT write-granted to the CI key: on "insufficient permissions: write <resource>" the fix is a human bootstrap `pulumi up`, never widening the CI key.
 * Matched as a case-insensitive substring (Scaleway emits `rdb_instance`, `vpc_private_network`, …).
 */
export const BOOTSTRAP_OWNED_FRAGMENTS = [
  'private_network', // VPC private network; CI is read-only
  'vpc', // the VPC itself
  'rdb', // managed PostgreSQL (rdb_instance, rdb_acl, rdb_user, …)
  'instance_db', // DB-bearing instance resources
  'domain_zone', // DNS zone
  'policy', // VM IAM policies; IAM write is forbidden for the CI key (perm-escalation)
] as const;

/** True when a Scaleway resource token names a bootstrap-owned resource. */
export function isBootstrapOwned(resource: string): boolean {
  const token = resource.toLowerCase();
  return BOOTSTRAP_OWNED_FRAGMENTS.some((fragment) => token.includes(fragment));
}
