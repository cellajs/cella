import type { QueryKey } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { queryClient } from '~/query/query-client';
import type { InfiniteQueryData } from '~/query/types';

/**
 * Returns the total number of items from an infinite query.
 * Automatically updates when the query cache changes.
 * Returns null while fetching if only initialData is available (dataUpdatedAt is 0).
 */
export function useInfiniteQueryTotal<T = unknown>(queryKey: QueryKey) {
  return useSyncExternalStore(
    // Subscribe to query cache changes
    (onStoreChange) => queryClient.getQueryCache().subscribe(onStoreChange),

    // Calculate snapshot of the total
    () => {
      const queryState = queryClient.getQueryState<InfiniteQueryData<T>>(queryKey);
      if (!queryState?.data || !queryState.data.pages.length) return null;

      // If only initialData is present (dataUpdatedAt is 0) and still fetching, defer showing total
      if (queryState.dataUpdatedAt === 0 && queryState.fetchStatus === 'fetching') return null;

      // Return total from last page
      return queryState.data.pages[queryState.data.pages.length - 1].total;
    },
  );
}
