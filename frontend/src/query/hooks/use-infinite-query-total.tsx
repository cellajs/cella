import type { QueryKey } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { queryClient } from '~/query/query-client';
import type { InfiniteQueryData } from '~/query/types';

/**
 * Returns the total number of items from an infinite query.
 * Automatically updates when the query cache changes.
 */
export function useInfiniteQueryTotal<T = unknown>(queryKey: QueryKey) {
  return useSyncExternalStore(
    // Subscribe to query cache changes
    (onStoreChange) => queryClient.getQueryCache().subscribe(onStoreChange),

    // Calculate snapshot of the total
    () => {
      const queryData = queryClient.getQueryData<InfiniteQueryData<T>>(queryKey);
      if (!queryData || !queryData.pages.length) return null;

      // Return total last page
      return queryData.pages[queryData.pages.length - 1].total;
    },
  );
}
