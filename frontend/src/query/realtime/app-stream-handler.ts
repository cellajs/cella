import type { ContextEntityType, ProductEntityType } from 'shared';
import { isProductEntity } from 'shared';
import type { GetUnseenCountsResponse } from '~/api.gen';
import { syncSpanNames, withSpanSync } from '~/lib/tracing';
import { seenKeys } from '~/modules/seen/query';
import { type EntityQueryKeys, getEntityQueryKeys } from '~/query/basic';
import { sourceId } from '~/query/offline';
import { queryClient } from '~/query/query-client';
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

    if (!isProductEntity(entityType))
      return console.error('Unknown entityType in app stream notification:', entityType);

    const keys = getEntityQueryKeys(entityType);
    if (!organizationId) return console.error('Missing organizationId for product entity event:', entityType, entityId);

    handleEntityNotification(entityType, entityId, action, stx, organizationId, seq, keys);
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
  organizationId: string,
  seq: number | null,
  keys: EntityQueryKeys,
): void {
  // Echo prevention: skip if this is our own mutation
  if (stx?.sourceId === sourceId) {
    console.debug('[handleEntityNotification] Echo prevention - skipping own mutation:', stx.mutationId);
    return;
  }

  // Track seq for gap detection — scoped per org for app stream
  if (seq !== null) {
    useSyncStore.getState().setSeq(organizationId, seq);
  }

  // Determine fetch priority based on entityConfig ancestors and current route
  const priority = getSyncPriority({ entityType, entityId, organizationId });

  switch (action) {
    case 'create':
    case 'update':
      if (priority === 'low') {
        // Mark stale only, refetch on next access
        cacheOps.invalidateEntityDetail(entityId, keys, 'none');
        cacheOps.invalidateEntityList(keys, 'none');
      } else {
        // Fetch single entity and patch both detail and list caches
        cacheOps.fetchEntityAndUpdateList(entityId, keys, action);
      }

      // Optimistically increment unseen count for new entities from other users
      if (action === 'create') {
        incrementUnseenCount(organizationId, entityType);
      }
      break;

    case 'delete':
      // Remove from detail and list caches directly (no refetch needed)
      cacheOps.removeEntityFromCache(entityType, entityId);
      cacheOps.removeEntityFromListCache(entityId, keys);

      // Invalidate unseen counts — can't know if deleted entity was unseen
      queryClient.invalidateQueries({ queryKey: seenKeys.unseenCounts });
      break;
  }

  console.debug(`[handleEntityNotification] ${entityType}:${action} priority=${priority}`);
}

/**
 * Optimistically increment the unseen count when a new entity is created via SSE.
 * Always correct since the user can't have seen a brand-new entity yet.
 */
function incrementUnseenCount(orgId: string, entityType: string): void {
  queryClient.setQueryData<GetUnseenCountsResponse>(seenKeys.unseenCounts, (old) => {
    if (!old) return old;
    return {
      ...old,
      [orgId]: { ...(old[orgId] ?? {}), [entityType]: (old[orgId]?.[entityType] ?? 0) + 1 },
    };
  });
}
