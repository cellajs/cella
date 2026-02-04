/**
 * CDC cache hook for entity cache.
 * Listens to ActivityBus events and manages cache entries.
 *
 * - On create/update: reserves cache slot with token from CDC
 * - On delete: invalidates cache entry by entity type/id
 *
 * Import this module during server startup to enable automatic cache management.
 */

import { isProductEntity } from 'config';
import { entityCache } from '#/lib/entity-cache';
import { type ActivityEventWithEntity, activityBus } from '#/sync/activity-bus';
import { logEvent } from '#/utils/logger';

let isRegistered = false;

/**
 * Handle activity event for cache management.
 */
function handleActivityEvent(event: ActivityEventWithEntity): void {
  const { action, entityType, entityId, cacheToken } = event;

  // Only handle product entities with valid entityType and entityId
  if (!entityType || !entityId || !isProductEntity(entityType)) {
    return;
  }

  if (action === 'create' || action === 'update') {
    // Reserve cache slot with token from CDC
    if (cacheToken) {
      entityCache.reserve(cacheToken, entityType, entityId);

      logEvent('debug', 'Entity cache slot reserved', {
        entityType,
        entityId,
        action,
        token: cacheToken.slice(0, 8),
      });
    }
  } else if (action === 'delete') {
    // Invalidate cache on delete
    const invalidated = entityCache.invalidateByEntity(entityType, entityId);

    if (invalidated) {
      logEvent('debug', 'Entity cache invalidated', {
        entityType,
        entityId,
        action,
      });
    }
  }
}

/**
 * Register cache hook with ActivityBus.
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
    logEvent('warn', 'Cache hook already registered');
    return;
  }

  activityBus.onAny(handleActivityEvent);
  isRegistered = true;

  logEvent('info', 'Entity cache hook registered');
}

/**
 * Unregister cache hook.
 * Useful for testing or cleanup.
 */
export function unregisterCacheInvalidation(): void {
  if (!isRegistered) return;

  activityBus.offAny(handleActivityEvent);
  isRegistered = false;

  logEvent('info', 'Entity cache hook unregistered');
}
