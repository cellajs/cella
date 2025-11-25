/**
 * Constants and types for synchronization services.
 */
export const SYNC_SERVICES = {
  BOILERPLATE_FORK: 'boilerplate-fork',
  BOILERPLATE_FORK_PACKAGES: 'boilerplate-fork+packages',
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
 * Nicely formatted options for UI or CLI selection.
 */
export const SYNC_SERVICE_OPTIONS = [
  { name: 'Boilerplate → fork (+Sync packages)', value: SYNC_SERVICES.BOILERPLATE_FORK_PACKAGES, disabled: true },
  { name: 'Boilerplate → fork', value: SYNC_SERVICES.BOILERPLATE_FORK },
  { name: 'Sync Packages', value: SYNC_SERVICES.PACKAGES },
  { name: 'Diverged files', value: SYNC_SERVICES.DIVERGED },
  { name: 'Only Analyze', value: SYNC_SERVICES.ANALYZE },
] as const;

/**
 * Short discriptions for each sync service.
 */
export const SYNC_SERVICE_DESCRIPTIONS: Record<SyncService, string> = {
  [SYNC_SERVICES.BOILERPLATE_FORK]: 'Sync files from the `boilerplate` to your `fork` via a `sync-branch`.',
  [SYNC_SERVICES.BOILERPLATE_FORK_PACKAGES]: 'Sync files from the `boilerplate` to your `fork` via a `sync-branch` and update package dependencies.',
  [SYNC_SERVICES.PACKAGES]: 'Only update package dependencies in your `fork` based on the `boilerplate`.',
  [SYNC_SERVICES.DIVERGED]: 'Analyze and report files that have diverged between the `boilerplate` and your `fork` without making changes.',
  [SYNC_SERVICES.ANALYZE]: 'Only analyze files differences without making any changes, and shows a summary of the analysis.',
}; 