import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { changeInfiniteQueryData, changeQueryData } from '~/query/basic/helpers';
import { forEachListQuery, isQueryData } from '~/query/basic/mutate-query';
import type { ItemData, QueryDataActions } from '~/query/basic/types';

/** Runs against every query that prefix-matches `queryKey`. */
function mutateMatchingQueries(queryKey: QueryKey, items: ItemData[], action: QueryDataActions) {
  forEachListQuery(queryKey, (key, data) => (isQueryData(data) ? changeQueryData : changeInfiniteQueryData)(key, items, action));
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

export function removeDetailQueriesById(client: QueryClient, detailBase: QueryKey, ids: Iterable<string | number>) {
  const idsToRemove = new Set(ids);
  if (idsToRemove.size === 0) return;

  const idIndex = detailBase.length;
  client.removeQueries({ queryKey: detailBase, predicate: ({ queryKey }) => idsToRemove.has(queryKey[idIndex] as string | number) });
}
