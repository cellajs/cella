/**
 * CDC cache hook for entity cache deletion.
 * Listens to ActivityBus events and invalidates cache on delete.
 *
 * Create/update reservations are handled exclusively by cdc-websocket.ts
 * (which calls entityCache.reserve() before emitting to ActivityBus).
 * This hook only handles deletions.
 *
 * Public entities (with parent: null) are excluded - they use their own LRU cache
 * managed in entities-handlers.ts via publicEntityCache.
 *
 * Import this module during server startup to enable automatic cache management.
 */

import { isProductEntity, isPublicStreamEntity } from 'shared';
import { entityCache } from '#/middlewares/entity-cache';
import { type ActivityEventWithEntity, activityBus } from '#/sync/activity-bus';
import { logEvent } from '#/utils/logger';

let isRegistered = false;

/**
 * Handle activity event for cache management.
 * Only handles delete events for private product entities.
 * Create/update reservations are done in cdc-websocket.ts.
 */
function handleActivityEvent(event: ActivityEventWithEntity): void {
  const { action, entityType, entityId } = event;

  // Only handle delete for product entities with valid entityType and entityId
  if (action !== 'delete' || !entityType || !entityId || !isProductEntity(entityType)) {
    return;
  }

  // Skip public entities - they use their own cache (publicEntityCache)
  if (isPublicStreamEntity(entityType)) {
    return;
  }

  const invalidated = entityCache.invalidateByEntity(entityType, entityId);

  if (invalidated) {
    logEvent(null, 'debug', 'Entity cache invalidated', {
      entityType,
      entityId,
      action,
    });
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
    logEvent(null, 'warn', 'Cache hook already registered');
    return;
  }

  activityBus.onAny(handleActivityEvent);
  isRegistered = true;

  logEvent(null, 'info', 'Entity cache hook registered');
}

/**
 * Unregister cache hook.
 * Useful for testing or cleanup.
 */
export function unregisterCacheInvalidation(): void {
  if (!isRegistered) return;

  activityBus.offAny(handleActivityEvent);
  isRegistered = false;

  logEvent(null, 'info', 'Entity cache hook unregistered');
}
