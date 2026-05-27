/**
 * Embedded entity propagation for client-side cache patching.
 *
 * When a source entity changes (e.g., label renamed), target entities that embed it
 * (e.g., task.labels[]) need their cached copies updated. This module scans the React
 * Query cache using Set lookups — sub-millisecond for typical cache sizes.
 *
 * Used by both live SSE handler (single/batch events) and catchup processor (post-delta-fetch).
 */

import { getEntityQueryKeys, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { findInCache } from '~/query/basic/find-in-list-cache';
import { isInfiniteQueryData, isQueryData } from '~/query/basic/mutate-query';
import type { EntityQueryData, InfiniteEntityQueryData, ItemData } from '~/query/basic/types';
import { queryClient } from '~/query/query-client';

/** Wire-compatible propagation hint (looser than config-derived PropagationHint) */
type PropagationHintInput = {
  sourceType: string;
  targetType: string;
  field: string;
  update: string[];
  remove: string[];
};

/**
 * Scan cached target entities and patch stale embedded source references.
 * Uses Set lookups for O(cached targets × avg embeddings) — sub-ms for typical caches.
 */
export function propagateEmbeddings(hint: PropagationHintInput): void {
  const { sourceType, targetType, field, update, remove } = hint;
  if (update.length === 0 && remove.length === 0) return;
  if (!hasEntityQueryKeys(targetType)) return;

  const updateSet = new Set(update);
  const removeSet = new Set(remove);

  // Read fresh source data for updates (must be in cache — caller ensures this)
  const freshSources = new Map<string, ItemData>();
  for (const id of update) {
    const data = findInCache<ItemData>(sourceType, id);
    if (data) freshSources.set(id, data);
  }

  const keys = getEntityQueryKeys(targetType);

  // Scan all cached list queries for the target type
  for (const [queryKey, queryData] of queryClient.getQueriesData({ queryKey: keys.list.base })) {
    if (!queryData) continue;

    if (isInfiniteQueryData(queryData)) {
      let mutated = false;
      const patchedPages = (queryData as InfiniteEntityQueryData).pages.map((page) => {
        const patchedItems = patchItems(page.items, field, updateSet, removeSet, freshSources);
        if (patchedItems !== page.items) {
          mutated = true;
          return { ...page, items: patchedItems };
        }
        return page;
      });
      if (mutated) {
        queryClient.setQueryData(queryKey, { ...queryData, pages: patchedPages });
      }
    } else if (isQueryData(queryData)) {
      const data = queryData as EntityQueryData;
      const patchedItems = patchItems(data.items, field, updateSet, removeSet, freshSources);
      if (patchedItems !== data.items) {
        queryClient.setQueryData(queryKey, { ...data, items: patchedItems });
      }
    }
  }

  // Patch detail caches (e.g., open task detail views)
  for (const [queryKey, target] of queryClient.getQueriesData({ queryKey: keys.detail.base })) {
    if (!target) continue;
    const patched = patchSingleTarget(target as ItemData, field, updateSet, removeSet, freshSources);
    if (patched !== target) {
      queryClient.setQueryData(queryKey, patched);
    }
  }
}

/** Patch an array of target items, returning the same reference if no changes. */
function patchItems(
  items: ItemData[],
  field: string,
  updateSet: Set<string>,
  removeSet: Set<string>,
  freshSources: Map<string, ItemData>,
): ItemData[] {
  let mutated = false;
  const result = items.map((item) => {
    const patched = patchSingleTarget(item, field, updateSet, removeSet, freshSources);
    if (patched !== item) mutated = true;
    return patched;
  });
  return mutated ? result : items;
}

/** Patch a single target entity's embedded field. Returns same reference if unchanged. */
function patchSingleTarget(
  target: ItemData,
  field: string,
  updateSet: Set<string>,
  removeSet: Set<string>,
  freshSources: Map<string, ItemData>,
): ItemData {
  const record = target as unknown as Record<string, unknown>;
  const embedded = record[field];

  // Array field (e.g., task.labels)
  if (Array.isArray(embedded)) {
    const needsPatch = embedded.some(
      (item: { id?: string }) => item.id && (updateSet.has(item.id) || removeSet.has(item.id)),
    );
    if (!needsPatch) return target;

    const patched = embedded
      .filter((item: { id?: string }) => !item.id || !removeSet.has(item.id))
      .map((item: { id?: string; updatedAt?: string }) => {
        if (!item.id || !updateSet.has(item.id)) return item;
        const fresh = freshSources.get(item.id);
        if (!fresh) return item;
        // Use updatedAt guard to avoid replacing newer data with older
        const freshRecord = fresh as unknown as Record<string, unknown>;
        if (item.updatedAt && freshRecord.updatedAt && freshRecord.updatedAt > item.updatedAt) return fresh;
        if (!item.updatedAt) return fresh;
        // fresh is same age or older — keep cached version (concurrent edit edge case)
        return item;
      });

    return { ...target, [field]: patched } as ItemData;
  }

  // Single object field (e.g., hypothetical task.category)
  if (embedded && typeof embedded === 'object' && 'id' in embedded) {
    const obj = embedded as { id: string; updatedAt?: string };
    if (removeSet.has(obj.id)) {
      return { ...target, [field]: null } as ItemData;
    }
    if (updateSet.has(obj.id)) {
      const fresh = freshSources.get(obj.id);
      if (fresh) {
        const freshRecord = fresh as unknown as Record<string, unknown>;
        if (obj.updatedAt && freshRecord.updatedAt && freshRecord.updatedAt > obj.updatedAt) {
          return { ...target, [field]: fresh } as ItemData;
        }
        if (!obj.updatedAt) {
          return { ...target, [field]: fresh } as ItemData;
        }
      }
    }
  }

  return target;
}
