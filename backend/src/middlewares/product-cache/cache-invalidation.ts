import { isProduct } from 'shared';
import { type ActivityEvent, activityBus } from '#/lib/activity-bus';
import { log } from '#/utils/logger';
import { productCache } from './app-product-cache';

let isRegistered = false;

/** Handles delete events for product entities; cdc-websocket.ts drops entries by id for every message, the mutation bus for the API's own writes. */
function handleActivityEvent(event: ActivityEvent): void {
  const { action, entityType, subjectId } = event;

  if (action !== 'delete' || !entityType || !subjectId || !isProduct(entityType)) {
    return;
  }

  const invalidated = productCache.invalidateProduct(entityType, subjectId);

  if (invalidated) {
    log.debug('Entity cache invalidated', { entityType, subjectId, action });
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
