import type { StreamChange } from 'sdk';
import { appConfig, type ProductEntityType } from 'shared';
import { asRecord } from 'shared/utils/as-record';
import { writeKeepingMark } from '~/query/basic/cache-mutations';
import { getEntityQueryKeys, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { findInCache } from '~/query/basic/find-in-list-cache';
import { forEachListQuery, mapListItems } from '~/query/basic/mutate-query';
import type { ItemData } from '~/query/basic/types';
import { queryClient } from '~/query/query-client';

/** Patch stale embedded-product references across every host column productEmbeddings declares for the changed product. */
export function propagateEmbeddings(hint: NonNullable<StreamChange['propagation']>): void {
  const { embeddedProductType, update, remove } = hint;
  if (update.length === 0 && remove.length === 0) return;

  const updateSet = new Set(update);
  const removeSet = new Set(remove);

  // The caller guarantees the fresh embedded data is already cached.
  const freshEmbedded = new Map<string, ItemData>();
  for (const id of update) {
    const data = findInCache<ItemData>(embeddedProductType, id);
    if (data) freshEmbedded.set(id, data);
  }

  for (const embedding of appConfig.productEmbeddings) {
    if (embedding.embeddedProductType !== embeddedProductType) continue;
    patchHostCaches(embedding.hostProductType, embedding.hostColumn, updateSet, removeSet, freshEmbedded);
  }
}

/** Patch one host product's cached lists and details for a single embedded column. */
function patchHostCaches(
  hostProductType: ProductEntityType,
  hostColumn: string,
  updateSet: Set<string>,
  removeSet: Set<string>,
  freshEmbedded: Map<string, ItemData>,
): void {
  if (!hasEntityQueryKeys(hostProductType)) return;

  const keys = getEntityQueryKeys(hostProductType);

  forEachListQuery(keys.list.base, (queryKey, data) => {
    const patched = mapListItems(data, (items) => patchItems(items, hostColumn, updateSet, removeSet, freshEmbedded));
    writeKeepingMark(queryClient, queryKey, () => patched);
  });

  for (const [queryKey, host] of queryClient.getQueriesData<ItemData>({ queryKey: keys.detail.base })) {
    if (!host) continue;
    const patched = patchSingleHost(host, hostColumn, updateSet, removeSet, freshEmbedded);
    writeKeepingMark(queryClient, queryKey, () => patched);
  }
}

/** Optimistic propagation for mutation hooks, so the actor's cache updates without waiting on the stream. For updates the fresh embedded copy must already be cached. */
export function propagateEmbeddedProduct(embeddedProductType: ProductEntityType, ids: string[], kind: 'update' | 'remove'): void {
  propagateEmbeddings({ embeddedProductType, update: kind === 'update' ? ids : [], remove: kind === 'remove' ? ids : [] });
}

/**
 * Rollback path for optimistic removals: propagation can strip an embedded copy but cannot re-insert one, so a failed delete recovers host data through a refetch.
 * @public
 */
export function invalidateEmbeddingHosts(embeddedProductType: ProductEntityType, organizationId: string): void {
  for (const embedding of appConfig.productEmbeddings) {
    if (embedding.embeddedProductType !== embeddedProductType) continue;
    if (!hasEntityQueryKeys(embedding.hostProductType)) continue;
    const keys = getEntityQueryKeys(embedding.hostProductType);
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

/** A fresh embedded copy replaces a cached one without a stamp or with an older one. Same age or older keeps the cached copy, so a concurrent edit is not undone. */
function isFresher(cached: { updatedAt?: string }, fresh: ItemData): boolean {
  const freshUpdatedAt = asRecord(fresh).updatedAt;
  return !cached.updatedAt || (!!freshUpdatedAt && freshUpdatedAt > cached.updatedAt);
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
    return { ...host, [hostColumn]: ids.filter((id) => !removeSet.has(id)) };
  }

  if (Array.isArray(embedded)) {
    const needsPatch = embedded.some((item: { id?: string }) => item.id && (updateSet.has(item.id) || removeSet.has(item.id)));
    if (!needsPatch) return host;

    let replaced = false;
    const patched = embedded
      .filter((item: { id?: string }) => !item.id || !removeSet.has(item.id))
      .map((item: { id?: string; updatedAt?: string }) => {
        const fresh = item.id && updateSet.has(item.id) ? freshEmbedded.get(item.id) : undefined;
        if (!fresh || !isFresher(item, fresh)) return item;
        replaced = true;
        return fresh;
      });

    // Every copy kept returns the host itself: a rewrite would mark its query fresh with unchanged data
    if (!replaced && patched.length === embedded.length) return host;
    return { ...host, [hostColumn]: patched };
  }

  if (embedded && typeof embedded === 'object' && 'id' in embedded) {
    const cached = embedded as { id: string; updatedAt?: string };
    if (removeSet.has(cached.id)) return { ...host, [hostColumn]: null };
    const fresh = updateSet.has(cached.id) ? freshEmbedded.get(cached.id) : undefined;
    if (fresh && isFresher(cached, fresh)) return { ...host, [hostColumn]: fresh };
  }

  return host;
}
