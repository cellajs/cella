import type { QueryKey } from '@tanstack/react-query';
import { queryClient } from '~/query/query-client';
import type { InfiniteQueryData } from '~/query/types';
import { useUIStore } from '~/store/ui';

/**
 * Wait for a given number of milliseconds.
 *
 * @param ms - Number of milliseconds to wait.
 * @returns Promise that resolves after the given number of milliseconds.
 */
export const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Get the offset to fetch next page for an infinite query.
 *
 * @param queryKey - Query key of the infinite query.
 * @returns number - Offset to fetch next page.
 */
export const getOffset = <T>(queryKey: QueryKey) => {
  const queryState = queryClient.getQueryState(queryKey);
  const offlineAccess = useUIStore.getState().offlineAccess;

  /**
   * on offlineAccess due to PersistQueryClientProvider on reload invalidate all queries, return undefined, so fetch func default couts offset as page * limit
   */
  if (offlineAccess) return undefined;

  //Query was invalidated and not re-fetched return 0
  if (!queryState || queryState.isInvalidated || queryState.status === 'pending') return 0;

  const [[_, data] = []] = queryClient.getQueriesData<InfiniteQueryData<T>>({ queryKey, exact: true, stale: false }) || [];
  if (!data) return 0;

  return data.pages.reduce((total, page) => total + page.items.length, 0) ?? 0;
};

export const getQueryKeySortOrder = (queryKey: QueryKey) => {
  // Find the object in queryKey that contains 'sort' and 'order' properties
  const sortData = queryKey.find(
    (el): el is { sort: string; order?: 'asc' | 'desc' } => typeof el === 'object' && el !== null && 'sort' in el && 'order' in el,
  );

  // If sorted by 'createdAt', return its order, otherwise 'desc'(at the top of list)
  return { hasSortData: !!sortData, sort: sortData?.sort, order: sortData?.sort === 'createdAt' ? (sortData.order ?? 'desc') : 'desc' };
};
