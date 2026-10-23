import { type ChannelEntityType, isProduct } from 'shared';
import { syncSpanNames, withSpanSync } from '~/lib/tracing';
import { invalidateUnseenCounts } from '~/modules/seen/query';
import { applyUnfetchableRemovalUnseen } from '~/modules/seen/unseen-sync';
import { type EntityQueryKeys, getEntityQueryKeys, type SeqRange } from '~/query/basic/entity-query-registry';
import { sourceId } from '~/query/offline/stx-utils';
import * as cacheOps from '~/query/realtime/cache-ops';
import { enqueueRange } from '~/query/realtime/fetch-prioritizer';
import * as membershipOps from '~/query/realtime/membership-ops';
import { propagateEmbeddings } from '~/query/realtime/propagation';
import { getSyncTier } from '~/query/realtime/sync-priority';
import { publishChangeEvent } from '~/query/realtime/sync-signals';
import { syncStore } from '~/query/realtime/sync-store';
import type { AppStreamNotification, ProductNotification } from '~/query/realtime/types';

/** Notifications carry no entity data: each one is answered with an invalidation or a seq-range fetch. */
export function handleAppStreamNotification(notification: AppStreamNotification): void {
  const { subjectId, action, organizationId, tenantId, channelType, seq, _trace } = notification;

  const spanAttributes = { 'sync.entity_type': notification.productType, 'sync.action': action, 'sync.entity_id': subjectId, _trace };

  withSpanSync(syncSpanNames.messageProcess, spanAttributes, () => {
    // Checked before trackOrg creates the entry: an org the sync store never saw means the SSE connection is not registered on its channel.
    const isUnknownOrg = !!organizationId && !syncStore.getState().orgs[organizationId];

    if (organizationId && tenantId) {
      syncStore.getState().trackOrg(organizationId, tenantId);
    }

    // Announced before any tier decision, so state derived from synced entities can react even for scopes whose rows are only fetched when opened.
    publishChangeEvent({
      kind: notification.kind,
      action,
      entityType: notification.productType ?? notification.resourceType ?? null,
      organizationId,
      channelId: notification.channelId ?? null,
      subjectId,
    });

    // Membership changes use targeted query invalidation, not the seq sync path.
    if (notification.kind === 'membership') {
      handleMembershipNotification(action, organizationId, channelType);
      // A self-membership in a new org arrives on the user channel, so reconnect to register on that org channel. Imported dynamically because stream-store imports this module.
      if (action === 'create' && isUnknownOrg) {
        console.debug('[handleAppStreamNotification] Membership in unknown org, reconnecting stream');
        void import('~/query/realtime/stream-store').then(({ appStreamManager }) => appStreamManager.reconnect());
      }
      return;
    }

    // The type narrows to a product here; the check guards a product type this bundle does not know.
    const entityType = notification.productType;
    if (!isProduct(entityType)) return console.error('Unknown entityType in app stream notification:', entityType);

    // Create, update, and soft-delete tombstones merge into prioritized lazy fetches; hard deletes have no fetchable row and take the invalidation path below.
    if (action !== 'delete' && notification.batchUntilSeq && seq != null && organizationId) {
      enqueueNotifiedRange(notification, organizationId, { afterSeq: seq - 1, untilSeq: notification.batchUntilSeq });
      return;
    }

    handleProductNotification(notification, getEntityQueryKeys(entityType));
  });
}

/** Hands a notified range to the fetch prioritizer, which fetches it on the tier of its scope. */
function enqueueNotifiedRange(notification: ProductNotification, organizationId: string, range: SeqRange): void {
  enqueueRange({
    entityType: notification.productType,
    organizationId,
    tenantId: notification.tenantId ?? null,
    channelId: notification.channelId ?? null,
    ...range,
    isCreate: notification.action === 'create',
    spreadWindowMs: notification.spreadWindow ?? undefined,
    propagation: notification.propagation ?? undefined,
  });
}

function handleMembershipNotification(
  action: AppStreamNotification['action'],
  organizationId: string | null,
  channelType: ChannelEntityType | null,
): void {
  switch (action) {
    case 'create':
    case 'delete':
      membershipOps.invalidateChannelList(channelType);
      membershipOps.invalidateMemberships();
      break;

    case 'update':
      membershipOps.invalidateMemberQueries(organizationId);
      membershipOps.refreshMe();
      break;
  }

  console.debug(`[handleMembershipNotification] ${action} channelType=${channelType} organizationId=${organizationId}`);
}

function handleProductNotification(notification: ProductNotification, keys: EntityQueryKeys): void {
  const { productType: entityType, subjectId: entityId, action, stx, organizationId, tenantId, seq, propagation } = notification;
  const channelId = notification.channelId ?? null;
  if (!organizationId || !entityId) {
    console.error('Missing organizationId/subjectId for product entity event:', entityType, entityId);
    return;
  }

  // Own create/update echoes patch STX without fetching; deletes always invalidate, because row STX names the last writer and not necessarily the deleter.
  if (action !== 'delete' && stx?.sourceId === sourceId) {
    cacheOps.patchEntityStxInCache(entityType, entityId, stx, organizationId);
    console.debug('[handleProductNotification] Echo: patched stx, skipped data fetch:', stx.mutationId);
    return;
  }

  // Delete-style removal and the seq-less fallback decide from the same tier system the fetch prioritizer uses: the viewing tier acts now, background and muted defer to next access.
  const isViewing = getSyncTier(entityType, organizationId, channelId).min === 0;

  switch (action) {
    case 'create':
    case 'update':
      if (seq != null) {
        // A single event is a width-1 batch on the same lazy path; the watermark advances only after a successful flush, since advancing earlier would skip the range forever.
        enqueueNotifiedRange(notification, organizationId, { afterSeq: seq - 1, untilSeq: seq });
        // Unseen accounting happens at flush time: unseen-sync counts the fetched rows.
        break;
      }

      if (!isViewing) {
        // Mark stale only; the next access refetches.
        cacheOps.invalidateEntityDetail(entityId, keys, 'none');
        cacheOps.invalidateEntityListForOrg(keys, organizationId, 'none');
      } else {
        // Propagation is chained after the fetch so fresh source data is in cache.
        cacheOps
          .fetchEntityAndUpdateList(entityType, entityId, keys, action, organizationId, tenantId)
          .then(() => {
            if (propagation) propagateEmbeddings(propagation);
          })
          .catch((error) => console.warn('[handleProductNotification] Entity fetch failed:', error));
      }

      // Seq-less events have no synced rows, so they trigger an exact unseen-count recount.
      if (action === 'create') {
        invalidateUnseenCounts(entityType);
      }
      break;

    case 'delete':
      // Physical deletes and unpublishes leave no fetchable tombstone; soft deletes stay updates reconciled through sequence ranges.
      cacheOps.invalidateEntityDetail(entityId, keys, 'none');
      cacheOps.invalidateEntityListForOrg(keys, organizationId, isViewing ? 'active' : 'none');
      applyUnfetchableRemovalUnseen(entityType, entityId, channelId);
      if (propagation) propagateEmbeddings(propagation);
      break;

    case 'moveOut':
      // A move-out reads as a removal here: this subscriber cannot fetch the new location.
      cacheOps.removeEntity(entityType, entityId, organizationId);
      applyUnfetchableRemovalUnseen(entityType, entityId, channelId);
      break;
  }

  console.debug(`[handleProductNotification] ${entityType}:${action} viewing=${isViewing}`);
}
