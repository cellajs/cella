import { isProductEntity, isPublicStreamEntity } from 'shared';
import { type ActivityEvent, activityBus } from '#/lib/activity-bus';
import { log } from '#/utils/logger';
import { entityCache } from './app-entity-cache';

let isRegistered = false;

/**
 * Handle activity event for cache management.
 * Only handles delete events for private product entities.
 * Create/update reservations are done in cdc-websocket.ts.
 */
function handleActivityEvent(event: ActivityEvent): void {
  const { action, entityType, subjectId } = event;

  // Only handle delete for product entities with valid entityType and entityId
  if (action !== 'delete' || !entityType || !subjectId || !isProductEntity(entityType)) {
    return;
  }

  // Skip public entities - they use their own cache (publicEntityCache)
  if (isPublicStreamEntity(entityType)) {
    return;
  }

  const invalidated = entityCache.invalidateByEntity(entityType, subjectId);

  if (invalidated) {
    log.debug('Entity cache invalidated', {
      entityType,
      subjectId,
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
 * import { registerCacheInvalidation } from '#/middlewares/entity-cache/cache-invalidation';
 *
 * // In server startup
 * registerCacheInvalidation();
 * ```
 */
export function registerCacheInvalidation(): void {
  if (isRegistered) {
    log.warn('Cache hook already registered');
    return;
  }

  activityBus.onAny(handleActivityEvent);
  isRegistered = true;

  log.info('Entity cache hook registered');
}

/**
 * Unregister cache hook.
 * Useful for testing or cleanup.
 */
export function unregisterCacheInvalidation(): void {
  if (!isRegistered) return;

  activityBus.offAny(handleActivityEvent);
  isRegistered = false;

  log.info('Entity cache hook unregistered');
}
