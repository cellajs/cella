import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { changeInfiniteQueryData, changeQueryData } from '~/query/basic/helpers';
import { isInfiniteQueryData, isQueryData } from '~/query/basic/mutate-query';
import type { ItemData, QueryDataActions } from '~/query/basic/types';
import { queryClient } from '~/query/query-client';

/**
 * Run a cache mutation (create / update / remove) against all queries
 * that prefix-match `queryKey`.
 */
function mutateMatchingQueries(queryKey: QueryKey, items: ItemData[], action: QueryDataActions) {
  for (const [key, data] of queryClient.getQueriesData({ queryKey })) {
    if (isQueryData(data)) changeQueryData(key, items, action);
    if (isInfiniteQueryData(data)) changeInfiniteQueryData(key, items, action);
  }
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

/** Remove detail queries for a set of IDs with a single query-cache scan. */
export function removeDetailQueriesById(client: QueryClient, detailBase: QueryKey, ids: Iterable<string | number>) {
  const idsToRemove = new Set(ids);
  if (idsToRemove.size === 0) return;

  const idIndex = detailBase.length;
  client.removeQueries({
    queryKey: detailBase,
    predicate: ({ queryKey }) => idsToRemove.has(queryKey[idIndex] as string | number),
  });
}
