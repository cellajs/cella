import { isProduct } from 'shared';
import { type ActivityEvent, activityBus } from '#/lib/activity-bus';
import { log } from '#/utils/logger';
import { productCache } from './app-product-cache';

let isRegistered = false;

/** Handles delete events for product entities only; cdc-websocket.ts invalidates on create and update. */
function handleActivityEvent(event: ActivityEvent): void {
  const { action, entityType, subjectId } = event;

  if (action !== 'delete' || !entityType || !subjectId || !isProduct(entityType)) {
    return;
  }

  const invalidated = productCache.invalidateProduct(entityType, subjectId);

  if (invalidated) {
    log.debug('Entity cache invalidated', {
      entityType,
      subjectId,
      action,
    });
  }
}

/** Registers the product-cache invalidation hook once during server startup. */
export function registerCacheInvalidation(): void {
  if (isRegistered) {
    log.warn('Cache hook already registered');
    return;
  }

  activityBus.onAny(handleActivityEvent);
  isRegistered = true;

  log.info('Entity cache hook registered');
}

export function unregisterCacheInvalidation(): void {
  if (!isRegistered) return;

  activityBus.offAny(handleActivityEvent);
  isRegistered = false;

  log.info('Entity cache hook unregistered');
}
