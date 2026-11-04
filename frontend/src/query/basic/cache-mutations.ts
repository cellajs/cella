import type { QueryClient, QueryFilters, QueryKey, SetDataOptions } from '@tanstack/react-query';
import { getQueryKeySortOrder } from '~/query/basic/get-query-key-sort-order';
import { forEachListQuery, getQueryItems, isInfiniteQueryData, mapListItems } from '~/query/basic/mutate-query';
import type { ItemData, QueryDataAction } from '~/query/basic/types';
import { queryClient } from '~/query/query-client';
import type { BaseQueryItem } from '~/query/types';

/**
 * Writes one cached query, keeping its refetch mark: `setQueryData` would clear `isInvalidated`, but a cache write is no
 * read of the server, so only a refetch clears the mark. Query code and the modules of synced products write through
 * here (`pnpm style`).
 * @param update - Returns the next data; the same data or undefined writes nothing, and leaves the timestamp as it was.
 */
export function writeKeepingMark<T>(
  client: QueryClient,
  queryKey: QueryKey,
  update: (data: T | undefined) => T | undefined,
  options?: SetDataOptions,
): void {
  const query = client.getQueryCache().get(client.defaultQueryOptions({ queryKey }).queryHash);
  const marked = query?.state.isInvalidated ?? false;
  const written = client.setQueryData<T>(
    queryKey,
    (data) => {
      const next = update(data);
      return next === data ? undefined : next;
    },
    options,
  );
  if (written !== undefined && marked) query?.invalidate();
}

/**
 * Before an optimistic write, cancels the reads of the queries under `queryKey` that hold data, keeping their refetch
 * marks. A cancel restores the state of the last write, unmarked, so each query that was marked or reading is marked
 * again: a read that was cancelled wanted fresh data. A first read runs on: a list without data takes no optimistic row,
 * and nothing would start a cancelled first read again.
 */
export async function cancelKeepingMark(client: QueryClient, queryKey: QueryKey): Promise<void> {
  const filters: QueryFilters = { queryKey, predicate: ({ state }) => state.data !== undefined };
  const owed = client
    .getQueryCache()
    .findAll(filters)
    .filter(({ state }) => state.isInvalidated || state.fetchStatus !== 'idle');
  await client.cancelQueries(filters);
  for (const query of owed) query.invalidate();
}

/** One page's items after the action: a create appends when `insertOrder` is 'asc', else prepends. */
function changePageItems<T extends ItemData>(pageItems: T[], changedItems: T[], action: QueryDataAction, insertOrder?: 'asc' | 'desc') {
  switch (action) {
    case 'create':
      return insertOrder === 'asc' ? [...pageItems, ...changedItems] : [...changedItems, ...pageItems];

    case 'update': {
      const updates = new Map(changedItems.map((item) => [item.id, item]));
      return pageItems.map((item) => updates.get(item.id) ?? item);
    }

    case 'remove': {
      const removedIds = new Set(changedItems.map(({ id }) => id));
      return pageItems.filter((item) => !removedIds.has(item.id));
    }
  }
}

/** The ids among `ids` that a page of the list hides while their delete is pending. */
function hiddenAmong(data: BaseQueryItem<ItemData>, ids: Set<string>): Set<string> {
  const pages = isInfiniteQueryData<ItemData>(data) ? data.pages : [];
  return new Set(pages.flatMap(({ hiddenIds = [] }) => hiddenIds.filter((id) => ids.has(id))));
}

/**
 * Totals move only by rows that enter or leave, so a partial overlap cannot drift them; new rows enter the first page, or the
 * last when `insertOrder` is 'asc'. A removed row a page hides leaves its `hiddenIds`: the server no longer sends it.
 */
function changeListItems(data: BaseQueryItem<ItemData>, items: ItemData[], action: QueryDataAction, insertOrder?: 'asc' | 'desc') {
  const cachedIds = new Set(getQueryItems(data).map(({ id }) => id));
  const changedItems = items.filter(({ id }) => (action === 'create' ? !cachedIds.has(id) : cachedIds.has(id)));
  const settledHidden = action === 'remove' ? hiddenAmong(data, new Set(items.map(({ id }) => id))) : new Set<string>();
  if (!changedItems.length && !settledHidden.size) return data;

  if (action === 'create') {
    const insertPage = insertOrder === 'asc' && isInfiniteQueryData(data) ? data.pages.length - 1 : 0;
    return mapListItems(
      data,
      (pageItems, index) => (index === insertPage ? changePageItems(pageItems, changedItems, action, insertOrder) : pageItems),
      changedItems.length,
    );
  }

  const changedIds = new Set(changedItems.map(({ id }) => id));
  const changed = mapListItems(
    data,
    (pageItems) => (pageItems.some(({ id }) => changedIds.has(id)) ? changePageItems(pageItems, changedItems, action) : pageItems),
    action === 'remove' ? -(changedItems.length + settledHidden.size) : 0,
  );
  if (!settledHidden.size || !isInfiniteQueryData<ItemData>(changed)) return changed;
  const pages = changed.pages.map((page) => (page.hiddenIds ? { ...page, hiddenIds: page.hiddenIds.filter((id) => !settledHidden.has(id)) } : page));
  return { ...changed, pages };
}

/** A paged list takes new rows in the createdAt order its key names, newest first by default; a flat list prepends them. */
export function changeListData(queryKey: QueryKey, items: ItemData[], action: QueryDataAction): void {
  writeKeepingMark<BaseQueryItem<ItemData>>(
    queryClient,
    queryKey,
    (data) => data && changeListItems(data, items, action, isInfiniteQueryData(data) ? getQueryKeySortOrder(queryKey) : undefined),
  );
}

/** The rows one write takes out of a list, changes in it and puts into it. */
export interface ListChanges {
  remove: ItemData[];
  update: ItemData[];
  create: ItemData[];
}

/**
 * Writes many rows of distinct ids into one list at once, each as {@link changeListData} would write it alone: new rows
 * enter in turn, so where they are prepended the last one leads.
 */
export function writeListChanges(queryKey: QueryKey, { remove, update, create }: ListChanges): void {
  writeKeepingMark<BaseQueryItem<ItemData>>(queryClient, queryKey, (data) => {
    if (!data) return data;
    const insertOrder = isInfiniteQueryData(data) ? getQueryKeySortOrder(queryKey) : undefined;
    const kept = changeListItems(changeListItems(data, remove, 'remove'), update, 'update');
    return changeListItems(kept, insertOrder === 'asc' ? create : create.toReversed(), 'create', insertOrder);
  });
}

function changeMatchingLists(queryKey: QueryKey, items: ItemData[], action: QueryDataAction) {
  forEachListQuery(queryKey, (key) => changeListData(key, items, action));
}

/** Add items to all queries that prefix-match `queryKey`. */
export function cacheCreate(queryKey: QueryKey, items: ItemData[]) {
  changeMatchingLists(queryKey, items, 'create');
}

/** Update items in all queries that prefix-match `queryKey`. */
export function cacheUpdate(queryKey: QueryKey, items: ItemData[]) {
  changeMatchingLists(queryKey, items, 'update');
}

/** Remove items from all queries that prefix-match `queryKey`. */
export function cacheRemove(queryKey: QueryKey, items: ItemData[]) {
  changeMatchingLists(queryKey, items, 'remove');
}

/** The detail queries of `ids` under `detailBase`, their descendants included; null for no ids. */
function detailsById(detailBase: QueryKey, ids: Iterable<string>): QueryFilters | null {
  const idSet = new Set<unknown>(ids);
  if (idSet.size === 0) return null;
  const idIndex = detailBase.length;
  return { queryKey: detailBase, predicate: ({ queryKey }) => idSet.has(queryKey[idIndex]) };
}

export function removeDetailQueriesById(client: QueryClient, detailBase: QueryKey, ids: Iterable<string>) {
  const filters = detailsById(detailBase, ids);
  if (filters) client.removeQueries(filters);
}

/**
 * {@link removeDetailQueriesById} for a confirmed delete whose page may still be open: a detail a page shows goes once the page
 * lets go of it, since its observer would fetch it again at once. An optimistic delete uses the immediate form: its callbacks
 * read a missing detail as deleted.
 */
export function removeDetailQueriesOnceUnobserved(client: QueryClient, detailBase: QueryKey, ids: Iterable<string>) {
  const filters = detailsById(detailBase, ids);
  if (!filters) return;

  const cache = client.getQueryCache();
  for (const query of cache.findAll(filters)) {
    if (query.getObserversCount() === 0) {
      cache.remove(query);
      continue;
    }
    const unsubscribe = cache.subscribe((event) => {
      if (event.query !== query) return;
      // Gone by another hand, such as a sign-out that clears the cache: nothing left to wait for.
      if (event.type === 'removed') return unsubscribe();
      if (event.type !== 'observerRemoved' || query.getObserversCount() > 0) return;
      unsubscribe();
      cache.remove(query);
    });
  }
}
