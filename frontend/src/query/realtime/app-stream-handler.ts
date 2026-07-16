import { type ChannelEntityType, isProductEntity, type ProductEntityType } from 'shared';
import { syncSpanNames, withSpanSync } from '~/lib/tracing';
import { invalidateUnseenCounts } from '~/modules/seen/query';
import { applyHardDeleteUnseen } from '~/modules/seen/seen-store';
import { type EntityQueryKeys, getEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { sourceId } from '~/query/offline/stx-utils';
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
          syncWindowMs: notification.syncWindow ?? undefined,
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
        notification.syncWindow ?? null,
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
  syncWindow?: number | null,
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
          syncWindowMs: syncWindow ?? undefined,
          propagation: propagation ?? undefined,
        });
        // Unseen accounting happens at flush time: the ledger counts the fetched rows.
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

      // Seq-less events bypass the ledger (no synced rows): exact recount instead.
      if (action === 'create') {
        invalidateUnseenCounts(entityType);
      }
      break;

    case 'delete':
      // Physical hard delete, rare except for DB admin cases. Product soft deletes are 'update' events
      // reconciled via seq-range tombstones; a hard delete leaves no row or tombstone to fetch,
      // so mark the detail stale and invalidate the org-scoped list to reconcile, consistent
      // with the catchup count-integrity invalidation flow. Covers single and batch deletes.
      cacheOps.invalidateEntityDetail(entityId, keys, 'none');
      cacheOps.invalidateEntityListForOrg(keys, organizationId, priority === 'low' ? 'none' : 'active');
      applyHardDeleteUnseen(entityType, entityId, channelId);
      if (propagation) propagateEmbeddings(propagation);
      break;
  }

  console.debug(`[handleEntityNotification] ${entityType}:${action} priority=${priority}`);
}
