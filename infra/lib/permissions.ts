// ───────────────────────────────────────────────────────────────────────────
// CI deploy key (`<slug>-ci-deploy`) — project scope
// ───────────────────────────────────────────────────────────────────────────

/**
 * Permission sets granted to the CI deploy key at project scope. The `…ReadOnly`
 * entries are bootstrap-owned (see BOOTSTRAP_OWNED_FRAGMENTS): CI refreshes them
 * on every `pulumi up` but may never mutate them — structural changes go through
 * a local bootstrap `pulumi up`.
 */
export const PROJECT_PERMISSION_SETS = [
  // Write — touched by routine CI deploys.
  'BlockStorageFullAccess', // block volumes attached to instances (split from InstancesFullAccess upstream)
  'ContainerRegistryFullAccess', // image push
  'IPAMFullAccess', // reserve + attach stable private IPAM IPs for VMs
  'InstancesFullAccess', // VM lifecycle
  'LoadBalancersFullAccess', // backend/frontend re-pointing
  'EdgeServicesFullAccess', // edge pipeline tweaks
  'ObjectStorageFullAccess', // frontend bucket uploads, policy refresh
  'PrivateNetworksFullAccess', // VM PN attachments (write required by InstancesFullAccess replacements)
  'SecretManagerFullAccess', // secret version rotation
  // Read-only — bootstrap-owned, refreshed but never mutated by CI.
  'VPCReadOnly',
  'RelationalDatabasesReadOnly',
] as const

// ───────────────────────────────────────────────────────────────────────────
// CI deploy key — organization scope
// ───────────────────────────────────────────────────────────────────────────

// Org-level grants are split by Scaleway *scope type*: a single IAM policy rule
// may only hold permission sets of ONE scope type, so these become two separate
// org-keyed rules in setup-ci-key.ts buildRules.

/** Project-scoped sets granted org-wide (all projects) — DNS is "Scoped by Project". */
export const ORG_WIDE_PROJECT_PERMISSION_SETS = ['DomainsDNSFullAccess'] as const

/**
 * Organization-scoped sets. IAMReadOnly lets `pulumi up` and the deploy's
 * "Verify VM reader IAM grant" step look up the CI/VM applications by name
 * (org-scoped IAM reads); self-introspection alone doesn't cover listing others.
 */
export const ORG_SCOPED_PERMISSION_SETS = ['IAMReadOnly'] as const

/** Union of all org-level grants — for audit/drift checks only (rule-agnostic). */
export const ORG_PERMISSION_SETS = [...ORG_WIDE_PROJECT_PERMISSION_SETS, ...ORG_SCOPED_PERMISSION_SETS] as const

// ───────────────────────────────────────────────────────────────────────────
// VM reader key (`<slug>-vm-reader`) — project scope
// ───────────────────────────────────────────────────────────────────────────

/**
 * Permission sets granted to the VM reader key at project scope. Deliberately
 * minimal — VMs only pull images and fetch runtime
 * secrets. SecretManagerSecretAccess decrypts secret VALUES (read-only, no
 * write); SecretManagerReadOnly alone is metadata-only and 403s the sync.
 */
export const VM_PROJECT_PERMISSION_SETS = [
  'ContainerRegistryReadOnly',
  'SecretManagerReadOnly',
  'SecretManagerSecretAccess',
] as const

// ───────────────────────────────────────────────────────────────────────────
// Bootstrap-owned boundary
// ───────────────────────────────────────────────────────────────────────────

/**
 * Resource-token fragments that are bootstrap-owned: NOT write-granted to the CI
 * key. When `pulumi up` reports "insufficient permissions: write <resource>" and
 * the token contains one of these, the fix is the CLI's "Apply infra change" (a
 * human bootstrap `pulumi up`), never widening the CI key. Matched as a
 * case-insensitive substring (Scaleway emits `rdb_instance`, `vpc_private_network`, …).
 */
export const BOOTSTRAP_OWNED_FRAGMENTS = [
  'private_network', // VPC private network — CI is read-only
  'vpc', // the VPC itself
  'rdb', // managed PostgreSQL (rdb_instance, rdb_acl, rdb_user, …)
  'instance_db', // DB-bearing instance resources
  'domain_zone', // DNS zone
  'policy', // VM reader IAM policy — IAM write is forbidden for the CI key (perm-escalation)
] as const

/** True when a Scaleway resource token names a bootstrap-owned resource. */
export function isBootstrapOwned(resource: string): boolean {
  const token = resource.toLowerCase()
  return BOOTSTRAP_OWNED_FRAGMENTS.some((fragment) => token.includes(fragment))
}
