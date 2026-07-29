import { appConfig, type ProductEntityType } from 'shared';
import { asRecord } from 'shared/utils/as-record';
import { getEntityQueryKeys, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { findInCache } from '~/query/basic/find-in-list-cache';
import { isInfiniteQueryData, isQueryData } from '~/query/basic/mutate-query';
import type { EntityQueryData, InfiniteEntityQueryData, ItemData } from '~/query/basic/types';
import { queryClient } from '~/query/query-client';

/** Wire-compatible propagation hint. Product types stay a plain union to tolerate types this fork's config omits. */
type PropagationHintInput = {
  embeddedProduct: ProductEntityType;
  /** Advisory on the wire: host fan-out derives from this fork's productEmbeddings config. */
  hostProduct?: ProductEntityType;
  hostColumn?: string;
  update: string[];
  remove: string[];
};

/**
 * Patch stale embedded-product references across every host column this fork's
 * productEmbeddings config declares for the changed product. The hint's own host fields are
 * advisory: local config is the authority on where this client caches embedded copies.
 * Used by live SSE handlers, catchup after delta fetches, and optimistic mutation hooks.
 */
export function propagateEmbeddings(hint: PropagationHintInput): void {
  const { embeddedProduct, update, remove } = hint;
  if (update.length === 0 && remove.length === 0) return;

  const updateSet = new Set(update);
  const removeSet = new Set(remove);

  // Read fresh embedded-product data for updates. The caller ensures it is cached.
  const freshEmbedded = new Map<string, ItemData>();
  for (const id of update) {
    const data = findInCache<ItemData>(embeddedProduct, id);
    if (data) freshEmbedded.set(id, data);
  }

  for (const embedding of appConfig.productEmbeddings) {
    if (embedding.embeddedProduct !== embeddedProduct) continue;
    patchHostCaches(embedding.hostProduct, embedding.hostColumn, updateSet, removeSet, freshEmbedded);
  }
}

/** Patch one host product's cached lists and details for a single embedded column. */
function patchHostCaches(
  hostProduct: ProductEntityType,
  hostColumn: string,
  updateSet: Set<string>,
  removeSet: Set<string>,
  freshEmbedded: Map<string, ItemData>,
): void {
  if (!hasEntityQueryKeys(hostProduct)) return;

  const keys = getEntityQueryKeys(hostProduct);

  // Scan all cached list queries for the host product
  for (const [queryKey, queryData] of queryClient.getQueriesData({ queryKey: keys.list.base })) {
    if (!queryData) continue;

    if (isInfiniteQueryData(queryData)) {
      let mutated = false;
      const patchedPages = (queryData as InfiniteEntityQueryData).pages.map((page) => {
        const patchedItems = patchItems(page.items, hostColumn, updateSet, removeSet, freshEmbedded);
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
      const patchedItems = patchItems(data.items, hostColumn, updateSet, removeSet, freshEmbedded);
      if (patchedItems !== data.items) {
        queryClient.setQueryData(queryKey, { ...data, items: patchedItems });
      }
    }
  }

  // Patch detail caches (e.g., open task detail views)
  for (const [queryKey, host] of queryClient.getQueriesData({ queryKey: keys.detail.base })) {
    if (!host) continue;
    const patched = patchSingleHost(host as ItemData, hostColumn, updateSet, removeSet, freshEmbedded);
    if (patched !== host) {
      queryClient.setQueryData(queryKey, patched);
    }
  }
}

/**
 * Hint-builder for mutation hooks: optimistic propagation of an embedded product's change,
 * so the actor's own cache updates immediately without waiting on the stream.
 * For updates, the fresh embedded copy must already be in cache when this runs.
 */
export function propagateEmbeddedProduct(
  embeddedProduct: ProductEntityType,
  ids: string[],
  kind: 'update' | 'remove',
): void {
  propagateEmbeddings({
    embeddedProduct,
    update: kind === 'update' ? ids : [],
    remove: kind === 'remove' ? ids : [],
  });
}

/**
 * Invalidate list caches of every host product embedding the given product. Rollback path
 * for optimistic removals: propagation can patch or strip an embedded copy but cannot
 * re-insert one, so a failed delete recovers host data through a refetch.
 */
export function invalidateEmbeddingHosts(embeddedProduct: ProductEntityType, organizationId: string): void {
  for (const embedding of appConfig.productEmbeddings) {
    if (embedding.embeddedProduct !== embeddedProduct) continue;
    if (!hasEntityQueryKeys(embedding.hostProduct)) continue;
    const keys = getEntityQueryKeys(embedding.hostProduct);
    queryClient.invalidateQueries({ queryKey: keys.list.org(organizationId) });
  }
}

/** Patch an array of host items, returning the same reference if no changes. */
function patchItems(
  items: ItemData[],
  hostColumn: string,
  updateSet: Set<string>,
  removeSet: Set<string>,
  freshEmbedded: Map<string, ItemData>,
): ItemData[] {
  let mutated = false;
  const result = items.map((item) => {
    const patched = patchSingleHost(item, hostColumn, updateSet, removeSet, freshEmbedded);
    if (patched !== item) mutated = true;
    return patched;
  });
  return mutated ? result : items;
}

/** Patch a single host product's embedded column. Returns same reference if unchanged. */
function patchSingleHost(
  host: ItemData,
  hostColumn: string,
  updateSet: Set<string>,
  removeSet: Set<string>,
  freshEmbedded: Map<string, ItemData>,
): ItemData {
  const record = asRecord(host);
  const embedded = record[hostColumn];

  // Plain id-array column: only removals are patchable, updates carry no embedded copy to refresh.
  if (Array.isArray(embedded) && embedded.every((item) => typeof item === 'string')) {
    const ids: string[] = embedded;
    if (!ids.some((id) => removeSet.has(id))) return host;
    return { ...host, [hostColumn]: ids.filter((id) => !removeSet.has(id)) } as ItemData;
  }

  // Array column of embedded objects (e.g., task.labels)
  if (Array.isArray(embedded)) {
    const needsPatch = embedded.some(
      (item: { id?: string }) => item.id && (updateSet.has(item.id) || removeSet.has(item.id)),
    );
    if (!needsPatch) return host;

    const patched = embedded
      .filter((item: { id?: string }) => !item.id || !removeSet.has(item.id))
      .map((item: { id?: string; updatedAt?: string }) => {
        if (!item.id || !updateSet.has(item.id)) return item;
        const fresh = freshEmbedded.get(item.id);
        if (!fresh) return item;
        // Use updatedAt guard to avoid replacing newer data with older
        const freshRecord = asRecord(fresh);
        if (item.updatedAt && freshRecord.updatedAt && freshRecord.updatedAt > item.updatedAt) return fresh;
        if (!item.updatedAt) return fresh;
        // fresh is same age or older, keep cached version (concurrent edit edge case).
        return item;
      });

    return { ...host, [hostColumn]: patched } as ItemData;
  }

  // Single object column (e.g., hypothetical task.category)
  if (embedded && typeof embedded === 'object' && 'id' in embedded) {
    const obj = embedded as { id: string; updatedAt?: string };
    if (removeSet.has(obj.id)) {
      return { ...host, [hostColumn]: null } as ItemData;
    }
    if (updateSet.has(obj.id)) {
      const fresh = freshEmbedded.get(obj.id);
      if (fresh) {
        const freshRecord = asRecord(fresh);
        if (obj.updatedAt && freshRecord.updatedAt && freshRecord.updatedAt > obj.updatedAt) {
          return { ...host, [hostColumn]: fresh } as ItemData;
        }
        if (!obj.updatedAt) {
          return { ...host, [hostColumn]: fresh } as ItemData;
        }
      }
    }
  }

  return host;
}
