import { appConfig, type ContextEntityType, isProductEntity, type ProductEntityType } from 'shared';
import type { GetUnseenCountsResponse } from '~/api.gen';
import { syncSpanNames, withSpanSync } from '~/lib/tracing';
import { seenKeys } from '~/modules/seen/query';
import { type EntityQueryKeys, getEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { sourceId } from '~/query/offline';
import { queryClient } from '~/query/query-client';
import { useSeenStore } from '~/store/seen';
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
      handleMembershipNotification(action, organizationId, contextType);
      return;
    }

    if (!isProductEntity(entityType))
      return console.error('Unknown entityType in app stream notification:', entityType);

    const keys = getEntityQueryKeys(entityType);
    if (!organizationId) return console.error('Missing organizationId for product entity event:', entityType, entityId);

    handleEntityNotification(
      entityType,
      entityId,
      action,
      stx,
      organizationId,
      seq ?? null,
      notification.contextId ?? null,
      keys,
    );
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
      membershipOps.invalidateMemberships();
      break;

    case 'update':
      membershipOps.invalidateMemberQueries(organizationId);
      membershipOps.refreshMe();
      break;

    case 'delete':
      membershipOps.invalidateContextList(contextType);
      membershipOps.invalidateMemberships();
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
  contextId: string | null,
  keys: EntityQueryKeys,
): void {
  // Echo prevention: skip data fetch/invalidation for own mutations,
  // but still patch stx metadata so subsequent mutations read fresh versions
  if (stx?.sourceId === sourceId) {
    cacheOps.patchEntityStxInCache(entityType, entityId, stx);
    console.debug('[handleEntityNotification] Echo — patched stx, skipped data fetch:', stx.mutationId);
    return;
  }

  // Track contextEntity-scoped seq watermark (from stamp_entity_seq trigger)
  if (seq !== null) {
    const seqKey = `${organizationId}:s:${entityType}`;
    const store = useSyncStore.getState();
    const current = store.getSeq(seqKey);
    if (seq > current) store.setSeq(seqKey, seq);
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
        cacheOps.fetchEntityAndUpdateList(entityId, keys, action, organizationId, entityType);
      }

      // Optimistically increment unseen count for new entities from other users
      if (action === 'create') {
        adjustUnseenCount(entityType, contextId, 1);
      }
      break;

    case 'delete':
      // Remove from detail and list caches directly (no refetch needed)
      cacheOps.removeEntityFromCache(entityType, entityId);
      cacheOps.removeEntityFromListCache(entityId, keys);

      handleDeleteUnseenCount(entityType, entityId, contextId);
      break;
  }

  console.debug(`[handleEntityNotification] ${entityType}:${action} priority=${priority}`);
}

/**
 * Adjust unseen count optimistically when a tracked entity is created or deleted via SSE.
 * Uses contextId to patch the query cache directly, avoiding a full refetch.
 * Falls back to query invalidation if contextId is unavailable.
 */
function adjustUnseenCount(entityType: string, contextId: string | null, delta: 1 | -1): void {
  const trackedTypes = appConfig.seenTrackedEntityTypes as readonly string[];
  if (!trackedTypes.includes(entityType)) return;

  if (!contextId) {
    queryClient.invalidateQueries({ queryKey: seenKeys.unseenCounts });
    return;
  }

  queryClient.setQueryData<GetUnseenCountsResponse>(seenKeys.unseenCounts, (old) => {
    if (!old) return old;
    const current = old[contextId]?.[entityType] ?? 0;
    const updated = Math.max(0, current + delta);

    if (updated === 0) {
      // Remove zero entries to keep cache clean
      if (!old[contextId]) return old;
      const { [entityType]: _, ...rest } = old[contextId];
      if (Object.keys(rest).length === 0) {
        const { [contextId]: __, ...withoutContext } = old;
        return withoutContext;
      }
      return { ...old, [contextId]: rest };
    }

    return { ...old, [contextId]: { ...old[contextId], [entityType]: updated } };
  });
}

/**
 * Handle unseen count adjustment when a tracked entity is deleted.
 * If the entity was already seen (in flushedIds or pending), the unseen count
 * doesn't change (total−1 and seen−1 cancel out). If it was unseen, decrement.
 * Falls back to query invalidation when contextId is unavailable.
 */
function handleDeleteUnseenCount(entityType: string, entityId: string, contextId: string | null): void {
  const trackedTypes = appConfig.seenTrackedEntityTypes as readonly string[];
  if (!trackedTypes.includes(entityType)) return;

  const seenStore = useSeenStore.getState();
  const wasSeen = seenStore.flushedIds.has(entityId) || isInPending(seenStore.pending, entityId);

  if (wasSeen) {
    // Entity was seen — total and seen both decrease by 1, net unseen change is 0
    // Clean up flushedIds so it doesn't grow unbounded
    if (seenStore.flushedIds.has(entityId)) {
      const newFlushed = new Set(seenStore.flushedIds);
      newFlushed.delete(entityId);
      useSeenStore.setState({ flushedIds: newFlushed });
    }
  } else {
    // Entity was unseen from this client's perspective — decrement
    adjustUnseenCount(entityType, contextId, -1);
  }
}

/** Check if an entityId is in any pending seen batch */
function isInPending(pending: Map<string, { entityIds: Set<string> }>, entityId: string): boolean {
  for (const batch of pending.values()) {
    if (batch.entityIds.has(entityId)) return true;
  }
  return false;
}
