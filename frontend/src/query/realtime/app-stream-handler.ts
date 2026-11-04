import type { StreamChange } from 'sdk';
import { frontendSpanNames } from 'shared/tracing';
import { withSpanSync } from '~/lib/tracing';
import { applyUnfetchableRemovalUnseen } from '~/modules/seen/unseen-sync';
import { userStore } from '~/modules/user/user-store';
import { getEntityQueryKeys, type SeqRange } from '~/query/basic/entity-query-registry';
import { sourceId } from '~/query/offline/hlc';
import * as cacheOps from '~/query/realtime/cache-ops';
import { enqueueRange, invalidateUndelivered } from '~/query/realtime/fetch-prioritizer';
import { invalidateEmbeddingHosts, propagateEmbeddings } from '~/query/realtime/propagation';
import { publishChangeEvent } from '~/query/realtime/sync-events';

/** Changes carry no entity data: each one is answered with an invalidation or a seq-range fetch. */
export function handleStreamChange(change: StreamChange): void {
  const { productType: entityType, action, organizationId, overflow } = change;
  const subjectIds = overflow ? (overflow.subjectIds ?? []) : change.rows.map(({ subjectId }) => subjectId);

  const spanAttributes = { 'sync.entity_type': entityType, 'sync.action': action, 'sync.row_count': subjectIds.length };

  withSpanSync(frontendSpanNames.messageProcess, spanAttributes, () => {
    // Announced before any tier decision, so state derived from synced entities can react even for scopes whose rows are only fetched when opened.
    for (const subjectId of subjectIds) publishChangeEvent({ action, entityType, organizationId, channelId: change.channelId, subjectId });

    if (overflow) handleOverflow(change, overflow);
    else handleProductChange(change);
  });
}

/**
 * A frame of more rows than it names in full: a create's or update's range goes to the lazy path, a delete or a
 * move-out removes the rows it names by id. Past those it refetches the lists of the type and recounts unseen, and a
 * removal drops every cached detail of the type below the frame's channel: the readable ones refetch when opened.
 */
function handleOverflow(change: StreamChange, { afterSeq, untilSeq, subjectIds }: NonNullable<StreamChange['overflow']>): void {
  const { productType: entityType, organizationId } = change;
  invalidateEmbeddingHosts(entityType, organizationId);
  const removal = change.action === 'delete' || change.action === 'moveOut';
  if (!removal && afterSeq !== null && untilSeq !== null) enqueueAnnouncedRange(change, { afterSeq, untilSeq });
  else if (removal && subjectIds) removeRows(change, subjectIds);
  else {
    invalidateUndelivered(entityType, organizationId, [change.channelId], true);
    if (removal) cacheOps.removeEntityDetailsBelow(entityType, change.channelId ?? organizationId);
  }
}

/**
 * Rows this reader cannot fetch any more: a delete leaves no tombstone, so each detail is marked and the lists refetch,
 * at once on screen; a move-out drops each row from the cache.
 */
function removeRows(change: StreamChange, subjectIds: string[]): void {
  const { productType: entityType, action, organizationId } = change;
  const channelId = change.channelId;
  const keys = getEntityQueryKeys(entityType);
  for (const subjectId of subjectIds) {
    if (action === 'moveOut') cacheOps.removeEntity(entityType, subjectId, organizationId);
    else cacheOps.invalidateEntityDetail(subjectId, keys, 'none');
  }
  applyUnfetchableRemovalUnseen(entityType, subjectIds, channelId);
  if (action === 'delete') invalidateUndelivered(entityType, organizationId, [channelId], false);
}

/** Hands an announced range to the fetch prioritizer, which fetches it on the tier of its scope. */
function enqueueAnnouncedRange(change: StreamChange, range: SeqRange): void {
  enqueueRange({
    entityType: change.productType,
    organizationId: change.organizationId,
    tenantId: change.tenantId,
    channelId: change.channelId,
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

function handleProductChange(change: StreamChange): void {
  const { productType: entityType, action, propagation } = change;

  // An own echo fetches nothing: the write's answer brings the stored row. A frame of only own rows fetches nothing.
  const rows = change.rows.filter((row) => {
    if (!isOwnEcho(action, row)) return true;
    console.debug('[handleProductChange] Echo: skipped data fetch:', row.stx?.mutationId);
    return false;
  });
  if (rows.length === 0) return;

  switch (action) {
    case 'create':
    case 'update': {
      // The range of the rows goes to the lazy path; the watermark advances once its flush settles, since advancing earlier would skip the range forever.
      const seqs = rows.flatMap(({ seq }) => (seq === null ? [] : [seq]));
      if (seqs.length > 0) enqueueAnnouncedRange(change, { afterSeq: Math.min(...seqs) - 1, untilSeq: Math.max(...seqs) });
      // Unseen accounting happens at flush time: unseen-sync counts the fetched rows.
      break;
    }

    // Physical deletes, unpublishes and move-outs; a soft delete stays an update reconciled through sequence ranges.
    case 'delete':
    case 'moveOut': {
      const subjectIds = rows.map(({ subjectId }) => subjectId);
      removeRows(change, subjectIds);
      if (propagation) propagateEmbeddings(propagation);
      break;
    }
  }

  console.debug(`[handleProductChange] ${entityType}:${action} rows=${rows.length}`);
}
