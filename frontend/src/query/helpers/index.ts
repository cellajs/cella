import type { QueryKey } from '@tanstack/react-query';
import { queryClient } from '~/query/query-client';
import type { InfiniteQueryData } from '~/query/types';

export const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const getOffset = <T>(queryKey: QueryKey) => {
  const queryState = queryClient.getQueryState<InfiniteQueryData<T>>(queryKey);

  //Query was invalidated and notre-fetched return 0
  if (!queryState || queryState.isInvalidated || queryState.status === 'pending') return 0;

  const { data } = queryState;
  return data?.pages.reduce((total, page) => total + page.items.length, 0) ?? 0;
};

export const getQueryKeySortOrder = (queryKey: QueryKey) => {
  // Find the object in queryKey that contains 'sort' and 'order' properties
  const sortData = queryKey.find(
    (el): el is { sort: string; order?: 'asc' | 'desc' } => typeof el === 'object' && el !== null && 'sort' in el && 'order' in el,
  );

  // If sorted by 'createdAt', return its order, otherwise 'desc'(at the top of list)
  return { hasSortData: !!sortData, sort: sortData?.sort, order: sortData?.sort === 'createdAt' ? (sortData.order ?? 'desc') : 'desc' };
};
