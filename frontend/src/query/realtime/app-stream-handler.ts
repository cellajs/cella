import type { GetUnseenCountsResponse } from 'sdk';
import { appConfig, type ChannelEntityType, isProductEntity, type ProductEntityType } from 'shared';
import { syncSpanNames, withSpanSync } from '~/lib/tracing';
import { seenKeys } from '~/modules/seen/query';
import { useSeenStore } from '~/modules/seen/seen-store';
import { type EntityQueryKeys, getEntityQueryKeys, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { sourceId } from '~/query/offline/stx-utils';
import { queryClient } from '~/query/query-client';
import { useSyncStore } from '~/query/realtime/sync-store';
import * as cacheOps from './cache-ops';
import * as membershipOps from './membership-ops';
import { propagateEmbeddings } from './propagation';
import { getSyncPriority } from './sync-priority';
import type { AppStreamNotification } from './types';

/**
 * Route an incoming app-stream notification to the membership/organization/product handler.
 * Notification-only format: no entity data included — handlers invalidate to refetch, or use
 * cacheToken for efficient fetches.
 */
export function handleAppStreamNotification(notification: AppStreamNotification): void {
  const { subjectId, action, stx, organizationId, tenantId, channelType, seq, cacheToken, _trace } = notification;

  withSpanSync(
    syncSpanNames.messageProcess,
    { entityType: notification.entityType, action, entityId: subjectId, _trace },
    () => {
      // Store cache token if present (for product entities)
      if (cacheToken && notification.entityType && subjectId) {
        cacheOps.storeEntityCacheToken(notification.entityType, subjectId, cacheToken);
      }

      // Store tenantId in sync store whenever we see it in a notification
      if (organizationId && tenantId) {
        useSyncStore.getState().setOrgTenantId(organizationId, tenantId);
      }

      // Membership changes use targeted query invalidation, not the seq/cacheToken sync path.
      if (notification.kind === 'membership') {
        handleMembershipNotification(action, organizationId, channelType);
        return;
      }

      // kind === 'entity', so entityType is narrowed to a product entity type.
      const entityType = notification.entityType;
      if (!isProductEntity(entityType))
        return console.error('Unknown entityType in app stream notification:', entityType);

      // Create/update batch: range fetch also handles soft-delete tombstones.
      if (notification.batchUntilSeq && seq != null && organizationId && hasEntityQueryKeys(entityType)) {
        const keys = getEntityQueryKeys(entityType);
        const seqCursor = `${seq},${notification.batchUntilSeq}`;

        cacheOps
          .fetchRangeAndPatch(entityType, organizationId, tenantId, seqCursor, keys, cacheToken ?? undefined)
          .then((success) => {
            if (success && notification.batchUntilSeq) {
              // Store project-scoped seq when channelId (projectId) is available, else org-scoped
              if (notification.channelId) {
                useSyncStore
                  .getState()
                  .setChannelSeq(organizationId, notification.channelId, entityType, notification.batchUntilSeq);
              } else {
                useSyncStore.getState().setOrgSeq(organizationId, entityType, notification.batchUntilSeq);
              }
            }
            // Propagate after fresh source data is in cache
            if (notification.propagation) propagateEmbeddings(notification.propagation);
          })
          .catch((err) => console.warn('[AppStream] Batch fetch failed:', err));

        // Unseen counts: never derive user-facing numbers from shared seq ranges — a
        // batch may contain drafts or span contexts, so its width is not "new for you".
        // Refetch the predicate-exact server counts instead (React Query dedupes bursts).
        if (action === 'create') {
          invalidateUnseenCounts(entityType);
        }
        return;
      }

      const keys = getEntityQueryKeys(entityType);
      if (!organizationId || !subjectId)
        return console.error('Missing organizationId/subjectId for product entity event:', entityType, subjectId);

      handleEntityNotification(
        entityType,
        subjectId,
        action,
        stx,
        organizationId,
        tenantId,
        seq ?? null,
        notification.channelId ?? null,
        keys,
        notification.propagation,
      );
    },
  );
}

/**
 * Handle membership create/update/delete via channelType-targeted invalidation (not broad):
 * create/delete invalidate the specific channel list + refresh menu; update invalidates member
 * queries and refreshes user data for role changes.
 */
function handleMembershipNotification(
  action: AppStreamNotification['action'],
  organizationId: string | null,
  channelType: ChannelEntityType | null,
): void {
  switch (action) {
    case 'create':
      membershipOps.invalidateChannelList(channelType);
      membershipOps.invalidateMemberships();
      break;

    case 'update':
      membershipOps.invalidateMemberQueries(organizationId);
      membershipOps.refreshMe();
      break;

    case 'delete':
      membershipOps.invalidateChannelList(channelType);
      membershipOps.invalidateMemberships();
      break;
  }

  console.debug(`[handleMembershipNotification] ${action} channelType=${channelType} organizationId=${organizationId}`);
}

/** Handle product entity events (page, attachment, …): notification-only, so invalidate/refetch (cacheToken for efficient fetches). */
function handleEntityNotification(
  entityType: ProductEntityType,
  entityId: string,
  action: AppStreamNotification['action'],
  stx: AppStreamNotification['stx'],
  organizationId: string,
  tenantId: string | null,
  seq: number | null,
  channelId: string | null,
  keys: EntityQueryKeys,
  propagation?: AppStreamNotification['propagation'],
): void {
  // Echo prevention for create/update: skip data fetch for own mutations,
  // but still patch stx metadata so subsequent mutations read fresh versions.
  // Deletes are excluded: the row's stx reflects its last writer, not the deleter,
  // so an unrelated user (the creator) would otherwise short-circuit and skip the removal.
  // Delete invalidation is idempotent, so a self-echo on delete is harmless.
  if (action !== 'delete' && stx?.sourceId === sourceId) {
    cacheOps.patchEntityStxInCache(entityType, entityId, stx, organizationId);
    console.debug('[handleEntityNotification] Echo — patched stx, skipped data fetch:', stx.mutationId);
    return;
  }

  // Track project-scoped seq watermark (from CDC worker)
  // Use channelId (projectId) for project-scoped entities, org fallback for org-scoped
  if (seq !== null) {
    const store = useSyncStore.getState();
    if (channelId) {
      const current = store.getChannelSeq(organizationId, channelId, entityType);
      if (seq > current) store.setChannelSeq(organizationId, channelId, entityType, seq);
    } else {
      const current = store.getOrgSeq(organizationId, entityType);
      if (seq > current) store.setOrgSeq(organizationId, entityType, seq);
    }
  }

  // Determine fetch priority based on entityConfig ancestors and current route
  const priority = getSyncPriority({ entityType, entityId, organizationId });

  switch (action) {
    case 'create':
    case 'update':
      if (seq !== null) {
        const seqCursor = `${seq},${seq}`;
        cacheOps
          .fetchRangeAndPatch(entityType, organizationId, tenantId, seqCursor, keys)
          .then((success) => {
            if (!success) {
              cacheOps.invalidateEntityDetail(entityId, keys, priority === 'low' ? 'none' : 'active');
              cacheOps.invalidateEntityListForOrg(keys, organizationId, priority === 'low' ? 'none' : 'active');
            }
            if (propagation) propagateEmbeddings(propagation);
          })
          .catch((err) => console.warn('[AppStream] Entity range fetch failed:', err));
        break;
      }

      if (priority === 'low') {
        // Mark stale only, refetch on next access
        cacheOps.invalidateEntityDetail(entityId, keys, 'none');
        cacheOps.invalidateEntityListForOrg(keys, organizationId, 'none');
      } else {
        // Fetch single entity and patch both detail and list caches.
        // Chain propagation after fetch so fresh source data is available.
        cacheOps
          .fetchEntityAndUpdateList(entityId, keys, action, organizationId, tenantId ?? undefined, entityType)
          .then(() => {
            if (propagation) propagateEmbeddings(propagation);
          })
          .catch((err) => console.warn('[AppStream] Entity fetch failed:', err));
      }

      // Optimistically increment unseen count for new entities from other users
      if (action === 'create') {
        adjustUnseenCount(entityType, channelId, 1);
      }
      break;

    case 'delete':
      // Physical hard delete, rare except for DB admin cases. Product soft deletes are 'update' events
      // reconciled via seq-range tombstones; a hard delete leaves no row or tombstone to fetch,
      // so mark the detail stale and invalidate the org-scoped list to reconcile, consistent
      // with the catchup count-integrity invalidation flow. Covers single and batch deletes.
      cacheOps.invalidateEntityDetail(entityId, keys, 'none');
      cacheOps.invalidateEntityListForOrg(keys, organizationId, priority === 'low' ? 'none' : 'active');
      handleDeleteUnseenCount(entityType, entityId, channelId);
      if (propagation) propagateEmbeddings(propagation);
      break;
  }

  console.debug(`[handleEntityNotification] ${entityType}:${action} priority=${priority}`);
}

/** Refetch the server's predicate-exact unseen counts for a tracked entity type. */
function invalidateUnseenCounts(entityType: string): void {
  const trackedTypes = appConfig.seenTrackedEntityTypes as readonly string[];
  if (!trackedTypes.includes(entityType)) return;
  queryClient.invalidateQueries({ queryKey: seenKeys.unseenCounts });
}

/**
 * Optimistically adjust the unseen count for a tracked entity created/deleted via SSE: patch the
 * cache directly by channelId to avoid a full refetch, falling back to invalidation if none.
 */
function adjustUnseenCount(entityType: string, channelId: string | null, delta: number): void {
  const trackedTypes = appConfig.seenTrackedEntityTypes as readonly string[];
  if (!trackedTypes.includes(entityType)) return;

  if (!channelId) {
    queryClient.invalidateQueries({ queryKey: seenKeys.unseenCounts });
    return;
  }

  queryClient.setQueryData<GetUnseenCountsResponse>(seenKeys.unseenCounts, (old) => {
    if (!old) return old;
    const current = old[channelId]?.[entityType] ?? 0;
    const updated = Math.max(0, current + delta);

    if (updated === 0) {
      // Remove zero entries to keep cache clean
      if (!old[channelId]) return old;
      const { [entityType]: _, ...rest } = old[channelId];
      if (Object.keys(rest).length === 0) {
        const { [channelId]: __, ...withoutChannel } = old;
        return withoutChannel;
      }
      return { ...old, [channelId]: rest };
    }

    return { ...old, [channelId]: { ...old[channelId], [entityType]: updated } };
  });
}

/**
 * Adjust the unseen count when a tracked entity is deleted: if it was already seen (flushedIds or
 * pending), the count is unchanged (total−1 and seen−1 cancel); if unseen, decrement. Falls back to
 * invalidation when channelId is unavailable.
 */
function handleDeleteUnseenCount(entityType: string, entityId: string, channelId: string | null): void {
  const trackedTypes = appConfig.seenTrackedEntityTypes as readonly string[];
  if (!trackedTypes.includes(entityType)) return;

  const seenStore = useSeenStore.getState();
  const wasSeen = seenStore.flushedIds.has(entityId) || isInPending(seenStore.pending, entityId);

  if (wasSeen) {
    // Entity was seen: total and seen both decrease by 1, net unseen change is 0.
    // Clean up flushedIds so it doesn't grow unbounded
    if (seenStore.flushedIds.has(entityId)) {
      const newFlushed = new Set(seenStore.flushedIds);
      newFlushed.delete(entityId);
      useSeenStore.setState({ flushedIds: newFlushed });
    }
  } else {
    // Entity was unseen from this client's perspective, decrement.
    adjustUnseenCount(entityType, channelId, -1);
  }
}

/** Check if an entityId is in any pending seen batch */
function isInPending(pending: Map<string, { entityIds: Set<string> }>, entityId: string): boolean {
  for (const batch of pending.values()) {
    if (batch.entityIds.has(entityId)) return true;
  }
  return false;
}
