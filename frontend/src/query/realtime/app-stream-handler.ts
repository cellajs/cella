import { type ChannelEntityType, isProduct, type ProductEntityType } from 'shared';
import { syncSpanNames, withSpanSync } from '~/lib/tracing';
import { invalidateUnseenCounts } from '~/modules/seen/query';
import { applyUnfetchableRemovalUnseen } from '~/modules/seen/unseen-sync';
import { type EntityQueryKeys, getEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { sourceId } from '~/query/offline/stx-utils';
import { syncStore } from '~/query/realtime/sync-store';
import * as cacheOps from './cache-ops';
import { enqueueRange } from './fetch-prioritizer';
import * as membershipOps from './membership-ops';
import { invalidateEmbeddedForHost, propagateEmbeddings } from './propagation';
import { getSyncTier } from './sync-priority';
import { publishChangeEvent } from './sync-signals';
import type { AppStreamNotification } from './types';

/** Notifications omit entity data, so each handler either invalidates or fetches a seq range. */
export function handleAppStreamNotification(notification: AppStreamNotification): void {
  const { subjectId, action, stx, organizationId, tenantId, channelType, seq, _trace } = notification;

  withSpanSync(
    syncSpanNames.messageProcess,
    { entityType: notification.productType, action, entityId: subjectId, _trace },
    () => {
      // Checked before setOrgTenantId creates the entry: an org the sync store never saw means the SSE connection is not registered on its channel.
      const isUnknownOrg = !!organizationId && !syncStore.getState().orgs[organizationId];

      if (organizationId && tenantId) {
        syncStore.getState().setOrgTenantId(organizationId, tenantId);
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
          void import('./stream-store').then((m) => m.appStreamManager.reconnect());
        }
        return;
      }

      // kind === 'product', so productType is narrowed to a product entity type.
      const entityType = notification.productType;
      if (!isProduct(entityType)) return console.error('Unknown entityType in app stream notification:', entityType);

      // Create, update, and soft-delete tombstones merge into prioritized lazy fetches; hard deletes have no fetchable row and take the invalidation path below.
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

/** Targets invalidation by channelType: create and delete hit that channel list, update hits member queries and refreshes user data for role changes. */
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

/** Product entity events carry no data, so each is answered with invalidation or a seq-range refetch. */
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
  // Own create/update echoes patch STX without fetching; deletes always invalidate, because row STX names the last writer and not necessarily the deleter.
  if (action !== 'delete' && stx?.sourceId === sourceId) {
    cacheOps.patchEntityStxInCache(entityType, entityId, stx, organizationId);
    console.debug('[handleEntityNotification] Echo: patched stx, skipped data fetch:', stx.mutationId);
    return;
  }

  // Delete-style removal and the seq-less fallback decide from the same tier system the fetch prioritizer uses: the viewing tier acts now, background and muted defer to next access.
  const isViewing = getSyncTier(entityType, organizationId, channelId).min === 0;

  switch (action) {
    case 'create':
    case 'update':
      if (seq !== null) {
        // A single event is a width-1 batch on the same lazy path; the watermark advances only after a successful flush, since advancing earlier would skip the range forever.
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
        // Mark stale only; the next access refetches.
        cacheOps.invalidateEntityDetail(entityId, keys, 'none');
        cacheOps.invalidateEntityListForOrg(keys, organizationId, 'none');
        invalidateEmbeddedForHost(entityType, organizationId, 'none');
      } else {
        // Propagation is chained after the fetch so fresh source data is in cache.
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
      // Physical deletes and unpublishes leave no fetchable tombstone; soft deletes stay updates reconciled through sequence ranges.
      cacheOps.invalidateEntityDetail(entityId, keys, 'none');
      cacheOps.invalidateEntityListForOrg(keys, organizationId, isViewing ? 'active' : 'none');
      // The row leaves with its references, and no tombstone reaches the embedding diff.
      invalidateEmbeddedForHost(entityType, organizationId, isViewing ? 'active' : 'none');
      applyUnfetchableRemovalUnseen(entityType, entityId, channelId);
      if (propagation) propagateEmbeddings(propagation);
      break;

    case 'moveOut':
      // A move-out reads as a removal here: this subscriber cannot fetch the new location.
      cacheOps.removeEntity(entityType, entityId, organizationId);
      applyUnfetchableRemovalUnseen(entityType, entityId, channelId);
      break;
  }

  console.debug(`[handleEntityNotification] ${entityType}:${action} viewing=${isViewing}`);
}
