import type { QueryKey } from '@tanstack/react-query';
import { hashKey } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { queryClient } from '~/query/query-client';
import type { InfiniteQueryData } from '~/query/types';

/**
 * Live total from an infinite query (updates on cache changes). Returns null while fetching if only
 * initialData is present (dataUpdatedAt === 0), to avoid showing a stale count.
 */
export function useInfiniteQueryTotal<T = unknown>(queryKey: QueryKey) {
  const keyHash = hashKey(queryKey);

  return useSyncExternalStore(
    // Subscribe to query cache changes, filtered to this query key
    (onStoreChange) =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.query.queryHash === keyHash) onStoreChange();
      }),

    // Calculate snapshot of the total
    () => {
      const queryState = queryClient.getQueryState<InfiniteQueryData<T>>(queryKey);
      if (!queryState?.data?.pages.length) return null;

      // If only initialData is present (dataUpdatedAt is 0) and still fetching, defer showing total
      if (queryState.dataUpdatedAt === 0 && queryState.fetchStatus === 'fetching') return null;

      // Return total from last page
      return queryState.data.pages[queryState.data.pages.length - 1].total;
    },
  );
}
