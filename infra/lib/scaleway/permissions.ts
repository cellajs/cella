// Deploy key (`<slug>-<mode>-ci-deploy`): the rights of plan §3.1, built into rules by lib/scaleway/deploy-policy.ts

/**
 * The deploy key's unconditioned project sets: machines and what they attach to (a builder machine among them), the buckets (narrowed per
 * bucket by their policies), and reads of what is privileged. Machines are granular: no serial console, no image, no snapshot and no
 * security group is written. No registry set: a release travels as archives in the boot-diag bucket, through links the deploy key signs.
 */
export const DEPLOY_PROJECT_PERMISSION_SETS = [
  'InstancesReadOnly',
  'InstancesServerCreate',
  'InstancesServerWrite',
  'InstancesServerDelete',
  'InstancesServerStart',
  'InstancesServerStop',
  'InstancesIpCreate',
  'InstancesIpWrite',
  'InstancesIpDelete',
  // The provider uses both Instance APIs for a private NIC: it creates one through v2 (`InstancesPrivateNetworkInterface*`) and detaches it
  // through v1 (`InstancesPrivateNic*`) when a machine is reaped. Neither family covers the other.
  'InstancesPrivateNetworkInterfaceCreate',
  'InstancesPrivateNetworkInterfaceWrite',
  'InstancesPrivateNetworkInterfaceDelete',
  'InstancesPrivateNicCreate',
  'InstancesPrivateNicWrite',
  'InstancesPrivateNicDelete',
  'InstancesVolumeCreate',
  'InstancesVolumeWrite',
  'InstancesVolumeDelete',
  'BlockStorageFullAccess',
  'IPAMFullAccess',
  'LoadBalancersFullAccess',
  'PrivateNetworksFullAccess',
  'ObjectStorageFullAccess',
  'VPCReadOnly',
  'RelationalDatabasesReadOnly',
  'ServerlessJobsReadOnly',
] as const;

/**
 * Secret metadata (names, folders, version counts, no value), on the whole project: Scaleway refuses a list call under any condition, and the
 * deploy finds its containers by listing them. The names are the registry's, which the repository holds. Values are read with the value set alone.
 */
export const DEPLOY_SECRET_METADATA_SETS = ['SecretManagerReadOnly'] as const;

/** Secret values, in the runtime folder only: the values the deploy composes into each machine's env file. */
export const DEPLOY_SECRET_VALUE_SETS = ['SecretManagerSecretAccess'] as const;

/** DNS permission set, "Scoped by Project" on Scaleway: the operator's, in the serving zone's project. The deploy key writes no DNS. */
export const DNS_PERMISSION_SETS = ['DomainsDNSFullAccess'] as const;

/** Organization-scoped sets: IAMReadOnly lets `pulumi up` look up applications by name. A rule holds sets of one scope type only. */
export const DEPLOY_ORG_PERMISSION_SETS = ['IAMReadOnly'] as const;

// Observer app (`<app>-observer`): reads, from any address

/**
 * Project-scoped sets for the observer application, the key a person and their agents read with: what `status`, `runs` and the plan of an
 * identity update read, each set named one by one, so a set that also reads secret values never comes in by a wider name. The key works from
 * any address, so it holds no set that reads a secret in the clear: no Instances set, as a machine's user data holds the links to its env
 * file until the deploy strips them, and no registry set. Object Storage reads need the bucket policy too: the state and boot-diagnostics
 * buckets name the observer, the others do not.
 */
export const OBSERVER_PROJECT_PERMISSION_SETS = [
  'LoadBalancersReadOnly',
  'ObjectStorageReadOnly',
  'RelationalDatabasesReadOnly',
  'SecretManagerReadOnly',
  'ServerlessJobsReadOnly',
] as const;

/** Org-scoped observer set: IAM reads, so `status` and the identity plan can name what exists. */
export const OBSERVER_ORG_PERMISSION_SETS = ['IAMReadOnly'] as const;

/**
 * Project-scoped set for the runner (`<app>-runner`), in each environment it serves: starting and reading the main job's runs. Scaleway has
 * no set that starts a run and cannot edit a definition, so the runner reaches what its jobs reference (plan §7). Its one rule carries the
 * condition of its reserved address.
 */
export const RUNNER_PROJECT_PERMISSION_SETS = ['ServerlessJobsFullAccess'] as const;

// Operators (`<app>-operator`, `<app>-operators`): the principals a person runs privileged actions as, one set per app

/**
 * Project-scoped set for the operator application and the operators group: every product of the app's projects, as a privileged
 * `pulumi up` writes all of them. No rule carries a condition: a key is held to its day (tasks/setup-operators.ts).
 */
export const OPERATOR_PROJECT_PERMISSION_SETS = ['AllProductsFullAccess'] as const;

/**
 * Organization-scoped set for the operator application: IAM read, for the bearer check, the lookup of applications by name and the verify
 * after an `up`. It holds no IAM write: a key that writes IAM cannot be held to its own app, since an IAM set is never scoped to a project
 * and a writer of policies can grant itself anything. IAM is written with an Owner API key.
 */
export const OPERATOR_ORG_PERMISSION_SETS = ['IAMReadOnly'] as const;

/**
 * The uploads application's sets (`<slug>-<mode>-uploads`): object reads, writes and deletes for the backend's uploads and presigned URLs.
 * Granular object sets, not FullAccess; the upload buckets' policies are the ones that admit it, and no other bucket names it.
 */
export const UPLOADS_PERMISSION_SETS = ['ObjectStorageObjectsRead', 'ObjectStorageObjectsWrite', 'ObjectStorageObjectsDelete'] as const;
