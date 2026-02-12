import type { ContextEntityType, ProductEntityType } from 'shared';
import { syncSpanNames, withSpanSync } from '~/lib/tracing';
import { type EntityQueryKeys, getEntityQueryKeys } from '~/query/basic';
import { sourceId } from '~/query/offline';
import { useSyncStore } from '~/store/sync';
import * as cacheOps from './cache-ops';
import * as membershipOps from './membership-ops';
import { getSyncPriority } from './sync-priority';
import type { AppStreamNotification } from './types';

/**
 * Handles incoming app stream notifications and updates the React Query cache accordingly.
 * Routes notifications to membership, organization, or product entity handlers.
 *
 * Notification-only format: no entity data is included. Handlers invalidate queries
 * to trigger refetch, or use cacheToken for efficient fetches.
 */
export function handleAppStreamNotification(notification: AppStreamNotification): void {
  const { entityId, action, resourceType, entityType, stx, organizationId, contextType, seq, cacheToken, _trace } =
    notification;

  withSpanSync(syncSpanNames.messageProcess, { entityType, action, entityId, _trace }, () => {
    // Store cache token if present (for product entities)
    if (cacheToken) {
      cacheOps.storeEntityCacheToken(entityType ?? '', entityId, cacheToken);
    }

    // Membership events (resourceType = 'membership')
    if (resourceType === 'membership') {
      // Track mSeq for membership gap detection (scoped per org with :m suffix)
      if (seq !== null && organizationId) {
        useSyncStore.getState().setSeq(`${organizationId}:m`, seq);
      }
      handleMembershipNotification(action, organizationId, contextType);
      return;
    }

    // Realtime entity events - use registry for dynamic lookup
    if (entityType) {
      const keys = getEntityQueryKeys(entityType);
      if (keys) {
        handleEntityNotification(entityType as ProductEntityType, entityId, action, stx, organizationId, seq, keys);
      }
    }
  });
}

/**
 * Handle membership events (created, updated, deleted).
 * Uses contextType for targeted query invalidation instead of broad invalidation.
 *
 * Strategy:
 * - create: Invalidate the specific context entity list (e.g., organizations), then refresh menu
 * - update: Invalidate member queries for the org, refresh user data for role changes
 * - delete: Invalidate the specific context entity list, then refresh menu
 */
function handleMembershipNotification(
  action: AppStreamNotification['action'],
  organizationId: string | null,
  contextType: ContextEntityType | null,
): void {
  switch (action) {
    case 'create':
      membershipOps.invalidateContextList(contextType);
      membershipOps.refreshMenu();
      break;

    case 'update':
      membershipOps.invalidateMemberQueries(organizationId);
      membershipOps.refreshMe();
      break;

    case 'delete':
      membershipOps.invalidateContextList(contextType);
      membershipOps.refreshMenu();
      break;
  }

  console.debug(`[handleMembershipNotification] ${action} contextType=${contextType} orgId=${organizationId}`);
}

/**
 * Handle product entity events (page, attachment, etc).
 * Uses notification-based sync: no entity data included.
 * Invalidates queries to trigger refetch, using cacheToken for efficient fetches.
 */
function handleEntityNotification(
  entityType: ProductEntityType,
  entityId: string,
  action: AppStreamNotification['action'],
  stx: AppStreamNotification['stx'],
  organizationId: string | null,
  seq: number | null,
  keys: EntityQueryKeys,
): void {
  // Echo prevention: skip if this is our own mutation
  if (stx?.sourceId === sourceId) {
    console.debug('[handleEntityNotification] Echo prevention - skipping own mutation:', stx.mutationId);
    return;
  }

  // Track seq for gap detection — scoped per org for app stream
  if (seq !== null && organizationId) {
    useSyncStore.getState().setSeq(organizationId, seq);
  }

  // Determine fetch priority based on entityConfig ancestors and current route
  const priority = getSyncPriority({ entityType, entityId, organizationId });

  // Map priority to refetchType:
  // - high: immediate refetch of active queries
  // - medium: debounced refetch (batch updates)
  // - low: invalidate only, refetch on next access
  const refetchType = priority === 'low' ? 'none' : 'active';

  // For medium priority, debounce the invalidation
  if (priority === 'medium') {
    debouncedInvalidateList(entityType, keys);
  }

  switch (action) {
    case 'create':
      // New entity - list must be refetched to include it
      if (priority !== 'medium') {
        cacheOps.invalidateEntityList(keys, refetchType);
      }
      break;

    case 'update':
      // Only invalidate detail - the entity already exists in the list,
      // it just needs fresh field values from a detail refetch.
      cacheOps.invalidateEntityDetail(entityId, keys, refetchType);
      break;

    case 'delete':
      // Remove from cache (detail + token)
      cacheOps.removeEntityFromCache(entityType, entityId);
      // List must be refetched to remove the deleted entity
      if (priority !== 'medium') {
        cacheOps.invalidateEntityList(keys, refetchType);
      }
      break;
  }

  console.debug(`[handleEntityNotification] ${entityType}:${action} priority=${priority}`);
}

/** Debounce timers for medium priority list invalidations */
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounce list invalidations for medium priority to batch rapid updates */
function debouncedInvalidateList(entityType: string, keys: EntityQueryKeys): void {
  const existing = debounceTimers.get(entityType);
  if (existing) clearTimeout(existing);

  debounceTimers.set(
    entityType,
    setTimeout(() => {
      cacheOps.invalidateEntityList(keys, 'active');
      debounceTimers.delete(entityType);
    }, 500),
  );
}
