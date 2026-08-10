// CI deploy key (`<slug>-ci-deploy`): project scope

/**
 * Permission sets granted to the CI deploy key at project scope. The `…ReadOnly`
 * entries are bootstrap-owned (see BOOTSTRAP_OWNED_FRAGMENTS): CI refreshes them
 * on every `pulumi up` but may not mutate them; structural changes go through
 * a local bootstrap `pulumi up`.
 */
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

/**
 * DNS permission set. "Scoped by Project" on Scaleway. The CI key receives it
 * project-scoped (the app project plus the serving zone's project, resolved in
 * setup-ci-key.ts), so a compromised CI key cannot touch unrelated zones. The
 * bootstrap grant (scaleway-iam.ts ensureBootstrapDnsGrant) still applies it
 * org-wide until the bootstrap key is revoked.
 */
export const DNS_PERMISSION_SETS = ['DomainsDNSFullAccess'] as const;

/**
 * Organization-scoped sets. IAMReadOnly lets `pulumi up` and the deploy's
 * "Verify VM IAM grants" step look up the CI/VM applications by name
 * (org-scoped IAM reads); self-introspection alone doesn't cover listing others.
 * A single IAM policy rule may only hold permission sets of ONE scope type, so
 * this stays a separate org-keyed rule in setup-ci-key.ts buildRules.
 */
export const ORG_SCOPED_PERMISSION_SETS = ['IAMReadOnly'] as const;

/** Audit union of the CI grants beyond the plain app-project rule (rule-agnostic). */
export const ORG_PERMISSION_SETS = [...DNS_PERMISSION_SETS, ...ORG_SCOPED_PERMISSION_SETS] as const;

// Admin app (`<slug>-<mode>-admin`): the standing human principal

/**
 * Permission sets granted to the admin application at project scope. The admin
 * app replaces the keyless operator app: it is what a human authenticates as
 * for day-2 operations (`pulumi preview --refresh`, teardown, state-bucket
 * recovery). Object Storage is the only write (bucket policies are
 * deny-by-default, so the admin needs both the IAM allow and its bucket-policy
 * statements); everything else is read-only: deliberately NO IAM write, no
 * instance/LB/secret writes. Structural changes still go through a transient
 * bootstrap key ("Apply infra change").
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

/**
 * Secret-value read sets; always paired with a resource-level path condition.
 * SecretManagerSecretAccess decrypts secret VALUES (read-only, no write);
 * SecretManagerReadOnly alone is metadata-only and 403s the sync.
 */
export const SERVICE_SECRET_PERMISSION_SETS = ['SecretManagerReadOnly', 'SecretManagerSecretAccess'] as const;

/**
 * Extra sets for the backend service app (REQ-20): S3 request signing for
 * attachment uploads + presigned URLs, replacing the retired `<slug>-s3`
 * managed key. Granular object sets, NOT FullAccess. Bucket policies then
 * scope which buckets.
 */
export const BACKEND_S3_PERMISSION_SETS = [
  'ObjectStorageObjectsRead',
  'ObjectStorageObjectsWrite',
  'ObjectStorageObjectsDelete',
] as const;

/**
 * Boot application sets: pull images (boot runner + service images) and write
 * boot diagnostics. Its Secret Manager rule is separate and conditioned to the
 * handoff folder only (bootKeyCondition).
 */
export const BOOT_PROJECT_PERMISSION_SETS = ['ContainerRegistryReadOnly', 'ObjectStorageObjectsWrite'] as const;

/**
 * The CI key-mint grant (D3): IAMApplicationManager, unconditioned. The
 * former `resource.id in [<app ids>]` condition is disproven on live
 * Scaleway (probe 2026-08-10: api-key POST on a LISTED app id → 403; the
 * api-key request carries no `resource.id` for the condition to match) —
 * raak's live rule has run unconditioned since its migration and its repo
 * condition was live/repo drift, not validation. Documented widening: CI can
 * manage applications/api-keys org-wide; the remaining firewall is the
 * absent IAMPolicyManager (CI cannot grant permissions). Re-narrow when the
 * condition vocabulary can address an api-key's parent application
 * (IAM_PRIVILEGE_RETHINK).
 */
export const CI_KEY_MINT_PERMISSION_SETS = ['IAMApplicationManager'] as const;

// Bootstrap-owned boundary

/**
 * Resource-token fragments that are bootstrap-owned: NOT write-granted to the CI
 * key. When `pulumi up` reports "insufficient permissions: write <resource>" and
 * the token contains one of these, the fix is the CLI's "Apply infra change" (a
 * human bootstrap `pulumi up`), never widening the CI key. Matched as a
 * case-insensitive substring (Scaleway emits `rdb_instance`, `vpc_private_network`, …).
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
