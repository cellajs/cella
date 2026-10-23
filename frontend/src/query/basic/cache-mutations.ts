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

/** Totals move only by rows that enter or leave, so a partial overlap cannot drift them; new rows enter the first page, or the last when `insertOrder` is 'asc'. */
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

/** A paged list takes new rows in the createdAt order its key names, newest first by default; a flat list prepends them. */
export function changeListData(queryKey: QueryKey, items: ItemData[], action: QueryDataAction): void {
  queryClient.setQueryData<BaseQueryItem<ItemData>>(
    queryKey,
    (data) => data && changeListItems(data, items, action, isInfiniteQueryData(data) ? getQueryKeySortOrder(queryKey) : undefined),
  );
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
 * {@link removeDetailQueriesById} for a confirmed delete whose page may still be open: a detail a page shows goes once the page
 * lets go of it, since its observer would fetch it again at once. An optimistic delete uses the immediate form: its callbacks
 * read a missing detail as deleted.
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
