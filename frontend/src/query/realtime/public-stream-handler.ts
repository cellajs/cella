import type { StreamNotification } from 'sdk';
import { isPublicStreamEntity } from 'shared';
import { getEntityQueryKeys, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { sourceId } from '~/query/offline';
import { useSyncStore } from '~/query/realtime/sync-store';
import * as cacheOps from './cache-ops';
import { propagateEmbeddings } from './propagation';

/**
 * Handles incoming public stream notifications and updates the React Query cache.
 * Processes public entity events (create, update, delete) for public/unauthenticated views.
 * Uses notification-based pattern: invalidates cache so data is refetched on access.
 *
 * Uses the entity query key registry for dynamic lookup (same pattern as app-stream-handler),
 * avoiding direct imports from entity modules which can cause HMR initialization errors.
 *
 * Uses refetchType: 'all' to ensure inactive queries (e.g., in closed sheets on mobile)
 * also refetch when they become active again.
 */
export function handlePublicStreamNotification(message: StreamNotification): void {
  const { entityType, subjectId, action, seq, stx } = message;

  // Only handle configured public entity types
  if (!entityType || !isPublicStreamEntity(entityType)) {
    return;
  }

  // Echo prevention: skip data fetch/invalidation for own mutations,
  // but still patch stx metadata so subsequent mutations read fresh versions
  if (stx?.sourceId === sourceId) {
    if (entityType && subjectId) cacheOps.patchEntityStxInCache(entityType, subjectId, stx);
    console.debug('[handlePublicStreamNotification] Echo — patched stx, skipped data fetch:', stx.mutationId);
    return;
  }

  // Track unscoped seq watermark (from CDC worker)
  if (seq !== null && seq !== undefined) {
    const store = useSyncStore.getState();
    const current = store.getPublicSeq(entityType);
    if (seq > current) store.setPublicSeq(entityType, seq);
  }

  // Create/update batch: range fetch also handles soft-delete tombstones.
  if (message.batchUntilSeq && hasEntityQueryKeys(entityType)) {
    const keys = getEntityQueryKeys(entityType);
    const seqCursor = `${seq},${message.batchUntilSeq}`;

    cacheOps
      .fetchRangeAndPatch(entityType, null, null, seqCursor, keys, message.cacheToken ?? undefined)
      .then((success) => {
        if (success && message.batchUntilSeq) {
          useSyncStore.getState().setPublicSeq(entityType, message.batchUntilSeq);
        }
        if (message.propagation) propagateEmbeddings(message.propagation);
      })
      .catch((err) => console.warn('[PublicStream] Batch fetch failed:', err));
    return;
  }

  // SINGLE ENTITY: existing flow
  const keys = getEntityQueryKeys(entityType);

  switch (action) {
    case 'create':
    case 'update':
      if (!subjectId) return;
      if (seq !== null && seq !== undefined) {
        const seqCursor = `${seq},${seq}`;
        cacheOps
          .fetchRangeAndPatch(entityType, null, null, seqCursor, keys, message.cacheToken ?? undefined)
          .then((success) => {
            if (!success) cacheOps.invalidateEntityList(keys, 'all');
            if (message.propagation) propagateEmbeddings(message.propagation);
          })
          .catch((err) => console.warn('[PublicStream] Entity range fetch failed:', err));
        break;
      }

      // Fetch single entity and patch both detail and list caches
      cacheOps
        .fetchEntityAndUpdateList(subjectId, keys, action, undefined, undefined, entityType)
        .then(() => {
          if (message.propagation) propagateEmbeddings(message.propagation);
        })
        .catch((err) => console.warn('[PublicStream] Entity fetch failed:', err));
      break;

    case 'delete':
      // Physical hard delete (rare — e.g. a DB admin). Soft deletes arrive as 'update' tombstones;
      // a hard delete leaves no row or tombstone to fetch, so invalidate the list to reconcile.
      // Covers single and batch deletes.
      cacheOps.invalidateEntityList(keys, 'all');
      if (message.propagation) propagateEmbeddings(message.propagation);
      break;
  }
}
