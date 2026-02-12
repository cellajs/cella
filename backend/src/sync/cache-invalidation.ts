/**
 * Cache invalidation hook for entity caches.
 * Listens to ActivityBus events and manages both private and public cache entries.
 *
 * Private entities (token-based entityCache):
 * - On create/update: reserves cache slot with token from CDC
 * - On delete: invalidates cache entry by entity type/id
 *
 * Public entities (LRU publicEntityCache):
 * - On any event: deletes cache entry by entity type/id
 *
 * Import this module during server startup to enable automatic cache management.
 */

import { isProductEntity, isPublicProductEntity } from 'shared';
import { entityCache, publicEntityCache } from '#/middlewares/entity-cache';
import { type ActivityEventWithEntity, activityBus } from '#/sync/activity-bus';
import { logEvent } from '#/utils/logger';

let isRegistered = false;

/**
 * Handle activity event for cache management.
 * Routes to the appropriate cache based on entity type.
 */
function handleActivityEvent(event: ActivityEventWithEntity): void {
  const { action, entityType, entityId, cacheToken } = event;

  if (!entityType || !entityId || !isProductEntity(entityType)) {
    return;
  }

  // Public entities use a simpler direct-key LRU cache
  if (isPublicProductEntity(entityType)) {
    publicEntityCache.delete(entityType, entityId);
    return;
  }

  // Private entities use the token-based reservation cache
  if (action === 'create' || action === 'update') {
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
