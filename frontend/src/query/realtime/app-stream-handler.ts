import { type ChannelEntityType, isProductEntity, type ProductEntityType } from 'shared';
import { syncSpanNames, withSpanSync } from '~/lib/tracing';
import { invalidateUnseenCounts } from '~/modules/seen/query';
import { applyHardDeleteUnseen } from '~/modules/seen/unseen-sync';
import { type EntityQueryKeys, getEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { sourceId } from '~/query/offline/stx-utils';
import { useSyncStore } from '~/query/realtime/sync-store';
import * as cacheOps from './cache-ops';
import { enqueueRange } from './fetch-prioritizer';
import * as membershipOps from './membership-ops';
import { propagateEmbeddings } from './propagation';
import { getSyncTier } from './sync-priority';
import type { AppStreamNotification } from './types';

/**
 * Route an incoming app-stream notification to the membership/organization/product handler.
 * Notifications omit entity data, so handlers invalidate or fetch a seq range.
 */
export function handleAppStreamNotification(notification: AppStreamNotification): void {
  const { subjectId, action, stx, organizationId, tenantId, channelType, seq, _trace } = notification;

  withSpanSync(
    syncSpanNames.messageProcess,
    { entityType: notification.entityType, action, entityId: subjectId, _trace },
    () => {
      // Checked before setOrgTenantId creates the entry: an org the sync store has never
      // seen means the SSE connection is not registered on its channel.
      const isUnknownOrg = !!organizationId && !useSyncStore.getState().orgs[organizationId];

      // Store tenantId in sync store whenever we see it in a notification
      if (organizationId && tenantId) {
        useSyncStore.getState().setOrgTenantId(organizationId, tenantId);
      }

      // Membership changes use targeted query invalidation, not the seq sync path.
      if (notification.kind === 'membership') {
        handleMembershipNotification(action, organizationId, channelType);
        // A self-membership in a NEW org arrives on the user channel; the connection is not
        // registered on that org channel, so reconnect to re-register and catch up on it.
        // (Dynamic import: stream-store imports this module for its config.)
        if (action === 'create' && isUnknownOrg) {
          console.debug('[handleAppStreamNotification] Membership in unknown org, reconnecting stream');
          void import('./stream-store').then((m) => m.appStreamManager.reconnect());
        }
        return;
      }

      // kind === 'entity', so entityType is narrowed to a product entity type.
      const entityType = notification.entityType;
      if (!isProductEntity(entityType))
        return console.error('Unknown entityType in app stream notification:', entityType);

      // Create/update batches enqueue a merged, spread seq range for lazy fetching.
      // The fetch prioritizer flushes viewing-tier scopes immediately. The range fetch also handles
      // soft-delete tombstones; unseen counts recount once per merged flush, not per batch
      // (a batch's width is never "new for you": drafts, own rows). Hard-delete batches must
      // not enqueue because deleted rows leave no tombstone to fetch. They fall through to
      // the delete branch's invalidation below.
      if (action !== 'delete' && notification.batchUntilSeq && seq != null && organizationId) {
        enqueueRange({
          entityType,
          organizationId,
          tenantId: tenantId ?? null,
          channelId: notification.channelId ?? null,
          fromSeq: seq,
          untilSeq: notification.batchUntilSeq,
          isCreate: action === 'create',
          spreadWindowMs: notification.spreadWindow ?? undefined,
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
        notification.spreadWindow ?? null,
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
  spreadWindow?: number | null,
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

  // The two paths without synced rows (hard delete, seq-less fallback) derive their
  // invalidation/fetch decision from the same tier system the fetch prioritizer uses: viewing tier
  // acts now, background/muted defers to next access.
  const isViewing = getSyncTier(entityType, organizationId, channelId).min === 0;

  switch (action) {
    case 'create':
    case 'update':
      if (seq !== null) {
        // A single event is a width-1 batch: same lazy path as batches (merge, spread, flush).
        // The caught-up watermark advances after a successful flush. Advancing before a fetch
        // completes would permanently skip the range.
        enqueueRange({
          entityType,
          organizationId,
          tenantId,
          channelId,
          fromSeq: seq,
          untilSeq: seq,
          isCreate: action === 'create',
          spreadWindowMs: spreadWindow ?? undefined,
          propagation: propagation ?? undefined,
        });
        // Unseen accounting happens at flush time: unseen-sync counts the fetched rows.
        break;
      }

      if (!isViewing) {
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

      // Seq-less events have no synced rows, so they trigger an exact unseen-count recount.
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
      cacheOps.invalidateEntityListForOrg(keys, organizationId, isViewing ? 'active' : 'none');
      applyHardDeleteUnseen(entityType, entityId, channelId);
      if (propagation) propagateEmbeddings(propagation);
      break;

    case 'moveOut':
      // The row left this subscriber's readable scope (reparent): the server sends this
      // ONLY when the new location is not readable here, so no delta fetch will ever
      // return the row. The notification is the removal. Treat it like a tombstone:
      // drop the row from lists/detail and correct unseen counts.
      cacheOps.removeEntity(entityType, entityId, organizationId);
      applyHardDeleteUnseen(entityType, entityId, channelId);
      break;
  }

  console.debug(`[handleEntityNotification] ${entityType}:${action} viewing=${isViewing}`);
}
