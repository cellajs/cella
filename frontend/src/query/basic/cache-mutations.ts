import type { QueryClient, QueryFilters, QueryKey } from '@tanstack/react-query';
import { changeListData } from '~/query/basic/helpers';
import { forEachListQuery } from '~/query/basic/mutate-query';
import type { ItemData, QueryDataActions } from '~/query/basic/types';

/** Runs against every query that prefix-matches `queryKey`. */
function mutateMatchingQueries(queryKey: QueryKey, items: ItemData[], action: QueryDataActions) {
  forEachListQuery(queryKey, (key) => changeListData(key, items, action));
}

/** Add items to all queries that prefix-match `queryKey`. */
export function cacheCreate(queryKey: QueryKey, items: ItemData[]) {
  mutateMatchingQueries(queryKey, items, 'create');
}

/** Update items in all queries that prefix-match `queryKey`. */
export function cacheUpdate(queryKey: QueryKey, items: ItemData[]) {
  mutateMatchingQueries(queryKey, items, 'update');
}

/** Remove items from all queries that prefix-match `queryKey`. */
export function cacheRemove(queryKey: QueryKey, items: ItemData[]) {
  mutateMatchingQueries(queryKey, items, 'remove');
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
