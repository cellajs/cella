import type { GetUnseenCountsResponse } from 'sdk';
import { appConfig, type ChannelEntityType, isProductEntity, type ProductEntityType } from 'shared';
import { syncSpanNames, withSpanSync } from '~/lib/tracing';
import { seenKeys } from '~/modules/seen/query';
import { useSeenStore } from '~/modules/seen/seen-store';
import { type EntityQueryKeys, getEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { sourceId } from '~/query/offline/stx-utils';
import { queryClient } from '~/query/query-client';
import { useSyncStore } from '~/query/realtime/sync-store';
import * as cacheOps from './cache-ops';
import { enqueueRange } from './lazy-sync-scheduler';
import * as membershipOps from './membership-ops';
import { propagateEmbeddings } from './propagation';
import { getSyncPriority } from './sync-priority';
import type { AppStreamNotification } from './types';

/**
 * Route an incoming app-stream notification to the membership/organization/product handler.
 * Notification-only format: no entity data included — handlers invalidate or seq-range fetch.
 */
export function handleAppStreamNotification(notification: AppStreamNotification): void {
  const { subjectId, action, stx, organizationId, tenantId, channelType, seq, _trace } = notification;

  withSpanSync(
    syncSpanNames.messageProcess,
    { entityType: notification.entityType, action, entityId: subjectId, _trace },
    () => {
      // Store tenantId in sync store whenever we see it in a notification
      if (organizationId && tenantId) {
        useSyncStore.getState().setOrgTenantId(organizationId, tenantId);
      }

      // Membership changes use targeted query invalidation, not the seq sync path.
      if (notification.kind === 'membership') {
        handleMembershipNotification(action, organizationId, channelType);
        return;
      }

      // kind === 'entity', so entityType is narrowed to a product entity type.
      const entityType = notification.entityType;
      if (!isProductEntity(entityType))
        return console.error('Unknown entityType in app stream notification:', entityType);

      // Create/update batch: enqueue the seq range for lazy fetching (merged, spread — the
      // scheduler flushes viewing-tier scopes immediately). The range fetch also handles
      // soft-delete tombstones; unseen counts recount once per merged flush, not per batch
      // (a batch's width is never "new for you": drafts, own rows).
      if (notification.batchUntilSeq && seq != null && organizationId) {
        enqueueRange({
          entityType,
          organizationId,
          tenantId: tenantId ?? null,
          channelId: notification.channelId ?? null,
          fromSeq: seq,
          untilSeq: notification.batchUntilSeq,
          isCreate: action === 'create',
          propagation: notification.propagation ?? undefined,
        });
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

/** Handle product entity events (page, attachment, …): notification-only, so invalidate or seq-range refetch. */
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

  // Determine fetch priority based on entityConfig ancestors and current route
  const priority = getSyncPriority({ entityType, entityId, organizationId });

  switch (action) {
    case 'create':
    case 'update':
      if (seq !== null) {
        // A single event is a width-1 batch: same lazy path as batches (merge, spread, flush).
        // The caught-up watermark now advances after a successful flush (batch semantics) —
        // advancing before a fetch that never completes would permanently skip the range.
        enqueueRange({
          entityType,
          organizationId,
          tenantId,
          channelId,
          fromSeq: seq,
          untilSeq: seq,
          isCreate: action === 'create',
          propagation: propagation ?? undefined,
        });

        // Optimistic +1 for others' creates stays at enqueue time until the unseen ledger
        // (Piece B) counts from fetched rows; without it, singles would regress from
        // optimistic patch to a delayed endpoint recount.
        if (action === 'create') {
          adjustUnseenCount(entityType, channelId, 1);
        }
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

/**
 * Optimistically adjust the unseen count for a tracked entity created/deleted via SSE: patch the
 * cache directly by channelId to avoid a full refetch, falling back to invalidation if none.
 */
function adjustUnseenCount(entityType: ProductEntityType, channelId: string | null, delta: number): void {
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
function handleDeleteUnseenCount(entityType: ProductEntityType, entityId: string, channelId: string | null): void {
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
