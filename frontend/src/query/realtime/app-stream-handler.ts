import type { StreamChange } from 'sdk';
import { isProduct } from 'shared';
import { frontendSpanNames } from 'shared/tracing';
import { withSpanSync } from '~/lib/tracing';
import { invalidateUnseenCounts } from '~/modules/seen/query';
import { applyUnfetchableRemovalUnseen } from '~/modules/seen/unseen-sync';
import { userStore } from '~/modules/user/user-store';
import { type EntityQueryKeys, getEntityQueryKeys, type SeqRange } from '~/query/basic/entity-query-registry';
import { sourceId } from '~/query/offline/hlc';
import * as cacheOps from '~/query/realtime/cache-ops';
import { enqueueRange, invalidateUndelivered } from '~/query/realtime/fetch-prioritizer';
import { invalidateEmbeddingHosts, propagateEmbeddings } from '~/query/realtime/propagation';
import { publishChangeEvent } from '~/query/realtime/sync-events';
import { getSyncTier } from '~/query/realtime/sync-priority';
import { syncStore } from '~/query/realtime/sync-store';

/** Changes carry no entity data: each one is answered with an invalidation or a seq-range fetch. */
export function handleStreamChange(change: StreamChange): void {
  const { productType: entityType, action, organizationId, tenantId, rows } = change;

  const spanAttributes = { 'sync.entity_type': entityType, 'sync.action': action, 'sync.row_count': rows.length };

  withSpanSync(frontendSpanNames.messageProcess, spanAttributes, () => {
    if (tenantId) syncStore.getState().trackOrg(organizationId, tenantId);

    // The check guards a product type this bundle does not know.
    if (!isProduct(entityType)) return console.error('Unknown entityType in app stream change:', entityType);

    // Announced before any tier decision, so state derived from synced entities can react even for scopes whose rows are only fetched when opened.
    for (const { subjectId } of rows) publishChangeEvent({ action, entityType, organizationId, channelId: change.channelId ?? null, subjectId });

    if (change.overflow) handleOverflow(change, change.overflow);
    else handleProductChange(change, getEntityQueryKeys(entityType));
  });
}

/** A frame of more rows than it names: a create's or update's range goes to the lazy path, any other change refetches the lists of the type. */
function handleOverflow(change: StreamChange, { afterSeq, untilSeq }: NonNullable<StreamChange['overflow']>): void {
  invalidateEmbeddingHosts(change.productType, change.organizationId);
  if (change.action !== 'delete' && change.action !== 'moveOut' && afterSeq !== null && untilSeq !== null) {
    enqueueAnnouncedRange(change, { afterSeq, untilSeq });
  } else {
    invalidateUndelivered(change.productType, change.organizationId, [change.channelId ?? null], true);
  }
}

/** Hands an announced range to the fetch prioritizer, which fetches it on the tier of its scope. */
function enqueueAnnouncedRange(change: StreamChange, range: SeqRange): void {
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

/**
 * The tab's own create or update of a row: its source id and its signed-in user, since every row the tab wrote shows
 * the source id to its readers. Deletes are never echoes, because row STX names the last writer and not necessarily the deleter.
 */
function isOwnEcho(action: StreamChange['action'], { stx, actorId }: StreamChange['rows'][number]): boolean {
  if (action === 'delete' || stx?.sourceId !== sourceId) return false;
  const userId = userStore.getState().user?.id;
  return userId !== undefined && actorId === userId;
}

function handleProductChange(change: StreamChange, keys: EntityQueryKeys): void {
  const { productType: entityType, action, organizationId, tenantId, propagation } = change;
  const channelId = change.channelId ?? null;

  // Own echoes patch STX without fetching; a frame of only own rows fetches nothing.
  const rows = change.rows.filter((row) => {
    if (!row.stx || !isOwnEcho(action, row)) return true;
    cacheOps.patchEntityStxInCache(entityType, row.subjectId, row.stx, organizationId);
    console.debug('[handleProductChange] Echo: patched stx, skipped data fetch:', row.stx.mutationId);
    return false;
  });
  if (rows.length === 0) return;

  // Delete-style removal and the seq-less fallback decide from the same tier system the fetch prioritizer uses: the viewing tier acts now, background and muted defer to next access.
  const isViewing = getSyncTier(entityType, organizationId, channelId).min === 0;

  switch (action) {
    case 'create':
    case 'update': {
      const seqs = rows.flatMap(({ seq }) => (seq == null ? [] : [seq]));
      if (seqs.length > 0) {
        // The range of the rows goes to the lazy path; the watermark advances only after a successful flush, since advancing earlier would skip the range forever.
        enqueueAnnouncedRange(change, { afterSeq: Math.min(...seqs) - 1, untilSeq: Math.max(...seqs) });
        // Unseen accounting happens at flush time: unseen-sync counts the fetched rows.
        break;
      }

      if (!isViewing) {
        // Mark stale only; the next access refetches.
        for (const { subjectId } of rows) cacheOps.invalidateEntityDetail(subjectId, keys, 'none');
        cacheOps.invalidateEntityListForOrg(keys, organizationId, 'none');
      } else {
        // Propagation is chained after the fetches so fresh source data is in cache.
        Promise.all(rows.map(({ subjectId }) => cacheOps.fetchEntityAndUpdateList(entityType, subjectId, keys, action, organizationId, tenantId)))
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
    }

    case 'delete':
      // Physical deletes and unpublishes leave no fetchable tombstone; soft deletes stay updates reconciled through sequence ranges.
      for (const { subjectId } of rows) {
        cacheOps.invalidateEntityDetail(subjectId, keys, 'none');
        applyUnfetchableRemovalUnseen(entityType, subjectId, channelId);
      }
      cacheOps.invalidateEntityListForOrg(keys, organizationId, isViewing ? 'active' : 'none');
      if (propagation) propagateEmbeddings(propagation);
      break;

    case 'moveOut':
      // A move-out reads as a removal here: this subscriber cannot fetch the new location.
      for (const { subjectId } of rows) {
        cacheOps.removeEntity(entityType, subjectId, organizationId);
        applyUnfetchableRemovalUnseen(entityType, subjectId, channelId);
      }
      break;
  }

  console.debug(`[handleProductChange] ${entityType}:${action} rows=${rows.length} viewing=${isViewing}`);
}
