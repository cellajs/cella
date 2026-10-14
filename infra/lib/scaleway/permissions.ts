// CI deploy key (`<slug>-ci-deploy`): project scope

/** Permission sets granted to the CI deploy key at project scope. The `…ReadOnly` entries are privileged resources: CI refreshes but may not mutate them. */
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
  // Read-only: privileged resources, refreshed but not mutated by CI.
  'VPCReadOnly',
  'RelationalDatabasesReadOnly',
] as const;

// CI deploy key: grants beyond the app project

/** DNS permission set, "Scoped by Project" on Scaleway. The CI key gets it project-scoped (app project plus the serving zone's project) so it cannot touch unrelated zones. */
export const DNS_PERMISSION_SETS = ['DomainsDNSFullAccess'] as const;

/** Organization-scoped sets: IAMReadOnly lets `pulumi up` look up applications by name. A single IAM policy rule may hold permission sets of only ONE scope type, so this needs its own org-keyed rule. */
const ORG_SCOPED_PERMISSION_SETS = ['IAMReadOnly'] as const;

/** Audit union of the CI grants beyond the plain app-project rule (rule-agnostic). */
export const ORG_PERMISSION_SETS = [...DNS_PERMISSION_SETS, ...ORG_SCOPED_PERMISSION_SETS] as const;

// Observer app (`<app>-observer`): reads, from the office only

/**
 * Project-scoped sets for the observer application, the key a person and their agents read with: `status`, the plan of an identity update, a
 * machine's boot account. Read-only sets named one by one, so a set that also reads secret values never comes in by a wider name. Object
 * Storage reads need the bucket policy too: the state and boot-diagnostics buckets name the observer, the others do not.
 */
export const OBSERVER_PROJECT_PERMISSION_SETS = [
  'BlockStorageReadOnly',
  'ContainerRegistryReadOnly',
  'DomainsDNSReadOnly',
  'IPAMReadOnly',
  'InstancesReadOnly',
  'LoadBalancersReadOnly',
  'ObjectStorageReadOnly',
  'PrivateNetworksReadOnly',
  'RelationalDatabasesReadOnly',
  'SecretManagerReadOnly',
  'ServerlessJobsReadOnly',
  'VPCReadOnly',
] as const;

/** Org-scoped observer set: IAM reads, so `status` and the identity plan can name what exists. */
export const OBSERVER_ORG_PERMISSION_SETS = ['IAMReadOnly'] as const;

// Operator app (`<app>-operator`): the principal a person runs privileged actions as, one per app

/**
 * Project-scoped set for the operator application: every product of the app's projects, as a privileged `pulumi up` writes all of them.
 * Every operator rule carries an IP condition (lib/scaleway/ip-lock.ts), so the key works from the dedicated address only.
 */
export const OPERATOR_PROJECT_PERMISSION_SETS = ['AllProductsFullAccess'] as const;

/**
 * Organization-scoped set for the operator application: IAM read, for the bearer check, the lookup of applications by name and the verify
 * after an `up`. It holds no IAM write: a key that writes IAM cannot be held to its own app, since an IAM set is never scoped to a project
 * and a writer of policies can grant itself anything. IAM is written with an Owner API key.
 */
export const OPERATOR_ORG_PERMISSION_SETS = ['IAMReadOnly'] as const;

// Machine identities: service and boot grants

/** Secret-value read sets, always paired with a resource-level path condition. SecretManagerReadOnly alone is metadata-only and 403s the sync; SecretManagerSecretAccess decrypts the values. */
export const SERVICE_SECRET_PERMISSION_SETS = ['SecretManagerReadOnly', 'SecretManagerSecretAccess'] as const;

/** Backend service app S3 signing sets for attachment uploads and presigned URLs. Granular object sets, NOT FullAccess; bucket policies scope which buckets. */
export const BACKEND_S3_PERMISSION_SETS = ['ObjectStorageObjectsRead', 'ObjectStorageObjectsWrite', 'ObjectStorageObjectsDelete'] as const;

/** Boot application sets: pull images and write boot diagnostics. Its Secret Manager rule is separate and conditioned to the handoff folder (bootKeyCondition). */
export const BOOT_PROJECT_PERMISSION_SETS = ['ContainerRegistryReadOnly', 'ObjectStorageObjectsWrite'] as const;

/** The CI policy's per-rule shape, shared by the rule builder and the drift check so the two cannot diverge. Every CI rule is unconditioned; a condition on any CI rule is drift. */
export interface CiRuleShape {
  id: 'project' | 'dns' | 'org-read';
  scope: 'project' | 'dns-projects' | 'organization';
  permissionSets: readonly string[];
}
export const CI_RULE_SHAPES: readonly CiRuleShape[] = [
  { id: 'project', scope: 'project', permissionSets: PROJECT_PERMISSION_SETS },
  { id: 'dns', scope: 'dns-projects', permissionSets: DNS_PERMISSION_SETS },
  { id: 'org-read', scope: 'organization', permissionSets: ORG_SCOPED_PERMISSION_SETS },
];

/**
 * Resource-token fragments of the privileged resources, the ones NOT write-granted to the CI key: on "insufficient permissions: write <resource>" the fix is a privileged `pulumi up` with the Owner API key, never widening the CI key.
 * Matched as a case-insensitive substring (Scaleway emits `rdb_instance`, `vpc_private_network`, …).
 */
const PRIVILEGED_RESOURCE_FRAGMENTS = [
  'private_network', // VPC private network; CI is read-only
  'vpc', // the VPC itself
  'rdb', // managed PostgreSQL (rdb_instance, rdb_acl, rdb_user, …)
  'instance_db', // DB-bearing instance resources
  'domain_zone', // DNS zone
  'policy', // VM IAM policies; IAM write is forbidden for the CI key (perm-escalation)
] as const;

/** True when a Scaleway resource token names a privileged resource. */
export function isPrivilegedResource(resource: string): boolean {
  const token = resource.toLowerCase();
  return PRIVILEGED_RESOURCE_FRAGMENTS.some((fragment) => token.includes(fragment));
}
