import type { QueryClient, QueryFilters, QueryKey } from '@tanstack/react-query';
import { getQueryKeySortOrder } from '~/query/basic/get-query-key-sort-order';
import { forEachListQuery, getQueryItems, isInfiniteQueryData, mapListItems } from '~/query/basic/mutate-query';
import type { ItemData, QueryDataAction } from '~/query/basic/types';
import { queryClient } from '~/query/query-client';
import type { BaseQueryItem } from '~/query/types';

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

/**
 * Applies create, update or remove to list data. Totals move only by rows that enter or leave, so a partial overlap
 * cannot drift them; new rows enter one page, the first when `insertOrder` lists newest first, else the last.
 */
function changeListItems(data: BaseQueryItem<ItemData>, items: ItemData[], action: QueryDataAction, insertOrder?: 'asc' | 'desc') {
  const cachedIds = new Set(getQueryItems(data).map(({ id }) => id));
  const changedItems = items.filter(({ id }) => (action === 'create' ? !cachedIds.has(id) : cachedIds.has(id)));
  if (!changedItems.length) return data;

  if (action === 'create') {
    const insertPage = insertOrder === 'asc' && isInfiniteQueryData(data) ? data.pages.length - 1 : 0;
    return mapListItems(
      data,
      (pageItems, index) => (index === insertPage ? changePageItems(pageItems, changedItems, action, insertOrder) : pageItems),
      changedItems.length,
    );
  }

  const changedIds = new Set(changedItems.map(({ id }) => id));
  return mapListItems(
    data,
    (pageItems) => (pageItems.some(({ id }) => changedIds.has(id)) ? changePageItems(pageItems, changedItems, action) : pageItems),
    action === 'remove' ? -changedItems.length : 0,
  );
}

/** Applies create, update or remove to the list cached under `queryKey`: a paged list inserts new rows in the key's createdAt order, a flat list prepends them. */
export function changeListData(queryKey: QueryKey, items: ItemData[], action: QueryDataAction): void {
  queryClient.setQueryData<BaseQueryItem<ItemData>>(
    queryKey,
    (data) => data && changeListItems(data, items, action, isInfiniteQueryData(data) ? getQueryKeySortOrder(queryKey) : undefined),
  );
}

/** Runs against every query that prefix-matches `queryKey`. */
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
function detailsById(detailBase: QueryKey, ids: Iterable<string | number>): QueryFilters | null {
  const idSet = new Set<unknown>(ids);
  if (idSet.size === 0) return null;
  const idIndex = detailBase.length;
  return { queryKey: detailBase, predicate: ({ queryKey }) => idSet.has(queryKey[idIndex]) };
}

export function removeDetailQueriesById(client: QueryClient, detailBase: QueryKey, ids: Iterable<string | number>) {
  const filters = detailsById(detailBase, ids);
  if (filters) client.removeQueries(filters);
}

/**
 * {@link removeDetailQueriesById} for a delete the server has confirmed while a page of the deleted row may still be
 * open, as a channel deleted from its own settings: a detail that page shows goes when the page lets go of it. Removed
 * under its observer it would be fetched again at once, for a row that no longer exists. An optimistic delete keeps
 * the immediate form: its other callbacks read a missing detail as "deleted".
 */
export function removeDetailQueriesOnceUnobserved(client: QueryClient, detailBase: QueryKey, ids: Iterable<string | number>) {
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
