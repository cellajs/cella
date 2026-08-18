import type { QueryKey } from '@tanstack/react-query';
import { hashKey } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { queryClient } from '~/query/query-client';
import type { InfiniteQueryData } from '~/query/types';

/** Live total from an infinite or flat list query. Returns null while fetching when only initialData is present, so no stale count is shown. */
export function useListQueryTotal<T = unknown>(queryKey: QueryKey) {
  const keyHash = hashKey(queryKey);

  return useSyncExternalStore(
    (onStoreChange) =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.query.queryHash === keyHash) onStoreChange();
      }),

    () => {
      const queryState = queryClient.getQueryState<InfiniteQueryData<T> | { items: T[]; total: number }>(queryKey);
      if (!queryState?.data) return null;

      if (queryState.dataUpdatedAt === 0 && queryState.fetchStatus === 'fetching') return null;

      if ('pages' in queryState.data) {
        const { pages } = queryState.data;
        return pages.length ? pages[pages.length - 1].total : null;
      }
      return queryState.data.total;
    },
  );
}
