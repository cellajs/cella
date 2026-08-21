import type { QueryKey } from '@tanstack/react-query';
import { appConfig, type ProductEntityType } from 'shared';
import { asRecord } from 'shared/utils/as-record';
import { resolveHomeChannelId } from '~/query/basic/apply-entity-to-lists';
import { getEntityQueryKeys, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { findInCache } from '~/query/basic/find-in-list-cache';
import { isInfiniteQueryData, isQueryData } from '~/query/basic/mutate-query';
import type { EntityQueryData, InfiniteEntityQueryData, ItemData, RoutableItemData } from '~/query/basic/types';
import { queryClient } from '~/query/query-client';

/** Wire-compatible propagation hint. Product types stay a plain union to tolerate types this app's config omits. */
type PropagationHintInput = {
  embeddedProduct: ProductEntityType;
  /** Advisory on the wire: host fan-out derives from this app's productEmbeddings config. */
  hostProduct?: ProductEntityType;
  hostColumn?: string;
  update: string[];
  remove: string[];
};

/**
 * Patch stale embedded-product references across every host column productEmbeddings declares for the changed product.
 * The hint's host fields are advisory: local config is the authority on where this client caches embedded copies.
 */
export function propagateEmbeddings(hint: PropagationHintInput): void {
  const { embeddedProduct, update, remove } = hint;
  if (update.length === 0 && remove.length === 0) return;

  const updateSet = new Set(update);
  const removeSet = new Set(remove);

  // The caller guarantees the fresh embedded data is already cached.
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

  for (const [queryKey, host] of queryClient.getQueriesData({ queryKey: keys.detail.base })) {
    if (!host) continue;
    const patched = patchSingleHost(host as ItemData, hostColumn, updateSet, removeSet, freshEmbedded);
    if (patched !== host) {
      queryClient.setQueryData(queryKey, patched);
    }
  }
}

/** Optimistic propagation for mutation hooks, so the actor's cache updates without waiting on the stream. For updates the fresh embedded copy must already be cached. */
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

/** Rollback path for optimistic removals: propagation can strip an embedded copy but cannot re-insert one, so a failed delete recovers host data through a refetch. */
export function invalidateEmbeddingHosts(embeddedProduct: ProductEntityType, organizationId: string): void {
  for (const embedding of appConfig.productEmbeddings) {
    if (embedding.embeddedProduct !== embeddedProduct) continue;
    if (!hasEntityQueryKeys(embedding.hostProduct)) continue;
    const keys = getEntityQueryKeys(embedding.hostProduct);
    queryClient.invalidateQueries({ queryKey: keys.list.org(organizationId) });
  }
}

// ── Embedded-product usage ───────────────────────────────────────────────────

/**
 * Embedded-product ids whose host references moved, keyed by embedded product. A host row is the
 * only writer of the reference, so an embedded row's server-side usage aggregates go stale while
 * its own row, seq and frontier stay untouched: no delta fetch can return the new value.
 */
export type EmbeddingTouches = Map<ProductEntityType, Set<string>>;

/** Ids a host row references through one embedding column; id arrays and embedded-copy arrays both reduce to ids. */
function embeddedIdsOf(host: ItemData | undefined, hostColumn: string): string[] {
  if (!host) return [];
  const value = asRecord(host)[hostColumn];
  if (!Array.isArray(value)) {
    if (value && typeof value === 'object' && 'id' in value) return [(value as { id: string }).id];
    return [];
  }
  return value.flatMap((entry) => {
    if (typeof entry === 'string') return [entry];
    if (entry && typeof entry === 'object' && 'id' in entry) return [(entry as { id: string }).id];
    return [];
  });
}

/**
 * Records the embedded rows a host row's reference change makes stale. Only the symmetric difference
 * counts, so an edit that leaves the column alone costs nothing. Without a previous row the change is
 * unclassifiable (a create, or a row this client never cached), so every current reference is taken as
 * touched: over-invalidation is cheap here, a missed one is invisible until the next reload.
 */
export function collectEmbeddingTouches(
  hostProduct: string,
  previous: ItemData | undefined,
  next: ItemData,
  into: EmbeddingTouches,
): void {
  for (const embedding of appConfig.productEmbeddings) {
    if (embedding.hostProduct !== hostProduct) continue;

    const nextIds = embeddedIdsOf(next, embedding.hostColumn);
    const previousIds = embeddedIdsOf(previous, embedding.hostColumn);
    const touched = previous
      ? [...nextIds.filter((id) => !previousIds.includes(id)), ...previousIds.filter((id) => !nextIds.includes(id))]
      : nextIds;
    if (touched.length === 0) continue;

    const ids = into.get(embedding.embeddedProduct) ?? new Set<string>();
    for (const id of touched) ids.add(id);
    into.set(embedding.embeddedProduct, ids);
  }
}

/**
 * Refetches the lists holding embedded rows whose usage changed. The aggregate is server-derived, so
 * the list endpoint owns its value. Home lists narrow the refetch to the channels that own the touched
 * rows; an uncached row cannot be placed, so its product widens to the organization list.
 */
export function invalidateEmbeddedUsage(touches: EmbeddingTouches, organizationId: string): void {
  for (const [embeddedProduct, ids] of touches) {
    if (!hasEntityQueryKeys(embeddedProduct)) continue;
    const keys = getEntityQueryKeys(embeddedProduct);

    // Touched rows sharing a channel share one list, so collect homes before invalidating.
    const homeChannelIds = new Set<string>();
    let widened = false;
    for (const id of ids) {
      const cached = findInCache<ItemData>(embeddedProduct, id);
      const homeChannelId = cached
        ? resolveHomeChannelId(embeddedProduct, { ...cached, organizationId } as RoutableItemData)
        : null;
      // An unplaceable row already covers every home, so stop narrowing.
      if (!homeChannelId) {
        widened = true;
        break;
      }
      homeChannelIds.add(homeChannelId);
    }

    const listKeys: QueryKey[] = widened
      ? [keys.list.org(organizationId)]
      : [...homeChannelIds].map((homeChannelId) => keys.list.home(organizationId, homeChannelId));

    for (const queryKey of listKeys) {
      queryClient.invalidateQueries({ queryKey, refetchType: 'active' });
    }
  }
}

/**
 * Coarse form for the paths that invalidate a host list without ingesting its rows: opaque views,
 * overflow, exhausted retries, nothing cached to patch. No row reaches the diff there, so every
 * product the host embeds may hold a stale usage aggregate.
 */
export function invalidateEmbeddedForHost(
  hostProduct: string,
  organizationId: string,
  refetchType: 'active' | 'none' = 'active',
): void {
  for (const embedding of appConfig.productEmbeddings) {
    if (embedding.hostProduct !== hostProduct) continue;
    if (!hasEntityQueryKeys(embedding.embeddedProduct)) continue;
    const keys = getEntityQueryKeys(embedding.embeddedProduct);
    queryClient.invalidateQueries({ queryKey: keys.list.org(organizationId), refetchType });
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

  // Array column of embedded objects.
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
        const freshRecord = asRecord(fresh);
        if (item.updatedAt && freshRecord.updatedAt && freshRecord.updatedAt > item.updatedAt) return fresh;
        if (!item.updatedAt) return fresh;
        // Same age or older: keep the cached copy so a concurrent edit is not undone.
        return item;
      });

    return { ...host, [hostColumn]: patched } as ItemData;
  }

  // Single object column.
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
