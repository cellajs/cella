import type { QueryKey } from '@tanstack/react-query';
import { hashKey } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { queryClient } from '~/query/query-client';
import type { InfiniteQueryData } from '~/query/types';

/**
 * Live total from a list query — infinite (pages) or flat ({ items, total }, e.g. canonical
 * org queries) — updating on cache changes. Returns null while fetching if only initialData
 * is present (dataUpdatedAt === 0), to avoid showing a stale count.
 */
export function useListQueryTotal<T = unknown>(queryKey: QueryKey) {
  const keyHash = hashKey(queryKey);

  return useSyncExternalStore(
    // Subscribe to query cache changes, filtered to this query key
    (onStoreChange) =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.query.queryHash === keyHash) onStoreChange();
      }),

    // Calculate snapshot of the total
    () => {
      const queryState = queryClient.getQueryState<InfiniteQueryData<T> | { items: T[]; total: number }>(queryKey);
      if (!queryState?.data) return null;

      // If only initialData is present (dataUpdatedAt is 0) and still fetching, defer showing total
      if (queryState.dataUpdatedAt === 0 && queryState.fetchStatus === 'fetching') return null;

      if ('pages' in queryState.data) {
        const { pages } = queryState.data;
        return pages.length ? pages[pages.length - 1].total : null;
      }
      return queryState.data.total;
    },
  );
}
