/**
 * CDC invalidation hook for entity cache.
 * Listens to ActivityBus events and invalidates cached entities.
 *
 * Import this module during server startup to enable automatic cache invalidation.
 */

import { entityCache } from '#/lib/entity-cache';
import { type ActivityEventWithEntity, activityBus } from '#/sync/activity-bus';
import { logEvent } from '#/utils/logger';

let isRegistered = false;

/**
 * Handle activity event and invalidate cache.
 */
function handleActivityEvent(event: ActivityEventWithEntity): void {
  const { action, entityType, entityId } = event;

  // Invalidate cache on update or delete
  if ((action === 'update' || action === 'delete') && entityType && entityId) {
    const invalidated = entityCache.invalidateEntity(entityType, entityId);

    if (invalidated > 0) {
      logEvent('debug', 'Entity cache invalidated', {
        entityType,
        entityId,
        action,
        invalidatedCount: invalidated,
      });
    }
  }
}

/**
 * Register cache invalidation hook with ActivityBus.
 * Call this once during server startup.
 *
 * @example
 * ```typescript
 * import { registerCacheInvalidation } from '#/sync/cache-invalidation';
 *
 * // In server startup
 * registerCacheInvalidation();
 * ```
 */
export function registerCacheInvalidation(): void {
  if (isRegistered) {
    logEvent('warn', 'Cache invalidation hook already registered');
    return;
  }

  activityBus.onAny(handleActivityEvent);
  isRegistered = true;

  logEvent('info', 'Entity cache invalidation hook registered');
}

/**
 * Unregister cache invalidation hook.
 * Useful for testing or cleanup.
 */
export function unregisterCacheInvalidation(): void {
  if (!isRegistered) return;

  activityBus.offAny(handleActivityEvent);
  isRegistered = false;

  logEvent('info', 'Entity cache invalidation hook unregistered');
}
