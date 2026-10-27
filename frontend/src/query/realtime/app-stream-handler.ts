import { isProduct } from 'shared';
import { frontendSpanNames } from 'shared/tracing';
import { withSpanSync } from '~/lib/tracing';
import { invalidateUnseenCounts } from '~/modules/seen/query';
import { applyUnfetchableRemovalUnseen } from '~/modules/seen/unseen-sync';
import { type EntityQueryKeys, getEntityQueryKeys, type SeqRange } from '~/query/basic/entity-query-registry';
import { sourceId } from '~/query/offline/hlc';
import * as cacheOps from '~/query/realtime/cache-ops';
import { enqueueRange } from '~/query/realtime/fetch-prioritizer';
import { propagateEmbeddings } from '~/query/realtime/propagation';
import { publishChangeEvent } from '~/query/realtime/sync-events';
import { getSyncTier } from '~/query/realtime/sync-priority';
import { syncStore } from '~/query/realtime/sync-store';
import type { AppStreamChange } from '~/query/realtime/types';

/** Changes carry no entity data: each one is answered with an invalidation or a seq-range fetch. */
export function handleStreamChange(change: AppStreamChange): void {
  const { productType: entityType, subjectId, action, organizationId, tenantId, seq, _trace } = change;

  const spanAttributes = { 'sync.entity_type': entityType, 'sync.action': action, 'sync.entity_id': subjectId, _trace };

  withSpanSync(frontendSpanNames.messageProcess, spanAttributes, () => {
    if (tenantId) syncStore.getState().trackOrg(organizationId, tenantId);

    // The check guards a product type this bundle does not know.
    if (!isProduct(entityType)) return console.error('Unknown entityType in app stream change:', entityType);

    // Announced before any tier decision, so state derived from synced entities can react even for scopes whose rows are only fetched when opened.
    publishChangeEvent({ action, entityType, organizationId, channelId: change.channelId ?? null, subjectId });

    // Create, update, and soft-delete tombstones merge into prioritized lazy fetches; hard deletes have no fetchable row and take the invalidation path below.
    if (action !== 'delete' && change.batchUntilSeq && seq != null) {
      enqueueAnnouncedRange(change, { afterSeq: seq - 1, untilSeq: change.batchUntilSeq });
      return;
    }

    handleProductChange(change, getEntityQueryKeys(entityType));
  });
}

/** Hands an announced range to the fetch prioritizer, which fetches it on the tier of its scope. */
function enqueueAnnouncedRange(change: AppStreamChange, range: SeqRange): void {
  enqueueRange({
    entityType: change.productType,
    organizationId: change.organizationId,
    tenantId: change.tenantId ?? null,
    channelId: change.channelId ?? null,
    ...range,
    isCreate: change.action === 'create',
    spreadWindowMs: change.spreadWindow ?? undefined,
    propagation: change.propagation ?? undefined,
  });
}

function handleProductChange(change: AppStreamChange, keys: EntityQueryKeys): void {
  const { productType: entityType, subjectId: entityId, action, stx, organizationId, tenantId, seq, propagation } = change;
  const channelId = change.channelId ?? null;

  // Own create/update echoes patch STX without fetching; deletes always invalidate, because row STX names the last writer and not necessarily the deleter.
  if (action !== 'delete' && stx?.sourceId === sourceId) {
    cacheOps.patchEntityStxInCache(entityType, entityId, stx, organizationId);
    console.debug('[handleProductChange] Echo: patched stx, skipped data fetch:', stx.mutationId);
    return;
  }

  // Delete-style removal and the seq-less fallback decide from the same tier system the fetch prioritizer uses: the viewing tier acts now, background and muted defer to next access.
  const isViewing = getSyncTier(entityType, organizationId, channelId).min === 0;

  switch (action) {
    case 'create':
    case 'update':
      if (seq != null) {
        // A single event is a width-1 batch on the same lazy path; the watermark advances only after a successful flush, since advancing earlier would skip the range forever.
        enqueueAnnouncedRange(change, { afterSeq: seq - 1, untilSeq: seq });
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
          .catch((error) => console.warn('[handleProductChange] Entity fetch failed:', error));
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

  console.debug(`[handleProductChange] ${entityType}:${action} viewing=${isViewing}`);
}
