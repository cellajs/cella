/**
 * Constants and types for synchronization services.
 */
export const SYNC_SERVICES = {
  UPSTREAM_FORK: 'upstream-fork',
  UPSTREAM_FORK_PACKAGES: 'upstream-fork+packages',
  PACKAGES: 'packages',
  DIVERGED: 'diverged',
  ANALYZE: 'analyze',
} as const;

/**
 * Type representing the supported synchronization services.
 */
export type SyncService = typeof SYNC_SERVICES[keyof typeof SYNC_SERVICES];

/**
 * Array of supported synchronization services.
 */
export const SUPPORTED_SYNC_SERVICES: SyncService[] = Object.values(SYNC_SERVICES);

/**
 * Services that are running from a local fork repository.
 */
export const SERVICES_RUNNING_FROM_LOCAL_FORK: SyncService[] = [
  SYNC_SERVICES.UPSTREAM_FORK,
  SYNC_SERVICES.UPSTREAM_FORK_PACKAGES,
  SYNC_SERVICES.PACKAGES,
  SYNC_SERVICES.DIVERGED,
  SYNC_SERVICES.ANALYZE,
];

/**
 * Nicely formatted options for UI or CLI selection.
 */
export const SYNC_SERVICE_OPTIONS = [
  { name: 'Upstream → fork (+Sync packages)', value: SYNC_SERVICES.UPSTREAM_FORK_PACKAGES, disabled: true },
  { name: 'Upstream → fork', value: SYNC_SERVICES.UPSTREAM_FORK },
  { name: 'Sync Packages', value: SYNC_SERVICES.PACKAGES },
  { name: 'Diverged files', value: SYNC_SERVICES.DIVERGED },
  { name: 'Only Analyze', value: SYNC_SERVICES.ANALYZE },
] as const;

/**
 * Short discriptions for each sync service.
 */
export const SYNC_SERVICE_DESCRIPTIONS: Record<SyncService, string> = {
  [SYNC_SERVICES.UPSTREAM_FORK]: 'Sync files from `upstream` to your `fork` via a `sync-branch`.',
  [SYNC_SERVICES.UPSTREAM_FORK_PACKAGES]: 'Sync files from `upstream` to your `fork` via a `sync-branch` and update package dependencies.',
  [SYNC_SERVICES.PACKAGES]: 'Only update package dependencies in your `fork` based on `upstream`.',
  [SYNC_SERVICES.DIVERGED]: 'Analyze and report files that have diverged between `upstream` and your `fork` without making changes.',
  [SYNC_SERVICES.ANALYZE]: 'Only analyze files differences without making any changes, and shows a summary of the analysis.',
}; 