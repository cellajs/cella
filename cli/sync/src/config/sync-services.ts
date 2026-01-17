/**
 * Constants and types for synchronization services.
 */
export const SYNC_SERVICES = {
  SYNC: 'sync',
  ANALYZE: 'analyze',
  VALIDATE: 'validate',
} as const;

/**
 * Type representing the supported synchronization services.
 */
export type SyncService = (typeof SYNC_SERVICES)[keyof typeof SYNC_SERVICES];

/**
 * Array of supported synchronization services.
 */
export const SUPPORTED_SYNC_SERVICES: SyncService[] = Object.values(SYNC_SERVICES);

/**
 * Services that are running from a local fork repository.
 */
export const SERVICES_RUNNING_FROM_LOCAL_FORK: SyncService[] = [
  SYNC_SERVICES.SYNC,
  SYNC_SERVICES.ANALYZE,
  SYNC_SERVICES.VALIDATE,
];

/**
 * Get dynamic description for a sync service using config values.
 */
export function getSyncServiceDescription(
  service: SyncService,
  cfg?: { upstream: { remoteName: string }; fork: { branch: string; syncBranch: string } },
): string {
  const descriptions: Record<SyncService, string> = {
    [SYNC_SERVICES.SYNC]: cfg
      ? `sync from '${cfg.upstream.remoteName}' → '${cfg.fork.syncBranch}' → '${cfg.fork.branch}'`
      : 'sync files and packages from upstream to your fork',
    [SYNC_SERVICES.ANALYZE]: 'read-only analysis for file differences and diverging/conflicting files',
    [SYNC_SERVICES.VALIDATE]: 'validate your cella.config.ts by checking whether file references exist',
  };
  return descriptions[service] || 'no description available';
}

/**
 * Static descriptions for menu (before config is loaded).
 */
export const SYNC_SERVICE_DESCRIPTIONS: Record<SyncService, string> = {
  [SYNC_SERVICES.SYNC]: 'sync files and packages from upstream to your fork',
  [SYNC_SERVICES.ANALYZE]: 'read-only analysis for file differences and diverging/conflicting files',
  [SYNC_SERVICES.VALIDATE]: 'validate your cella.config.ts by checking whether file references exist',
};

/**
 * Nicely formatted options for UI or CLI selection with descriptions.
 */
export const SYNC_SERVICE_OPTIONS = [
  {
    name: 'sync',
    value: SYNC_SERVICES.SYNC,
    description: SYNC_SERVICE_DESCRIPTIONS[SYNC_SERVICES.SYNC],
  },
  {
    name: 'analyze',
    value: SYNC_SERVICES.ANALYZE,
    description: SYNC_SERVICE_DESCRIPTIONS[SYNC_SERVICES.ANALYZE],
  },
  {
    name: 'validate',
    value: SYNC_SERVICES.VALIDATE,
    description: SYNC_SERVICE_DESCRIPTIONS[SYNC_SERVICES.VALIDATE],
  },
] as const;
