/**
 * Constants and types for synchronization services.
 */
export const SYNC_SERVICES = {
  BOILERPLATE_FORK: 'boilerplate-fork',
  BOILERPLATE_FORK_PACKAGES: 'boilerplate-fork+packages',
  PACKAGES: 'packages',
  DIVERGED: 'diverged',
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
  { name: 'Diverged files', value: SYNC_SERVICES.DIVERGED },
  { name: 'Sync Packages', value: SYNC_SERVICES.PACKAGES },
] as const;