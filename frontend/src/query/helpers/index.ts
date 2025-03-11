import type { QueryKey } from '@tanstack/react-query';
import { queryClient } from '~/query/query-client';
import type { InfiniteQueryData } from '~/query/types';

export const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const getOffset = <T>(queryKey: QueryKey) => {
  const data = queryClient.getQueryData<InfiniteQueryData<T>>(queryKey);

  // Sum the number of items across all pages
  const offset = data?.pages.reduce((total, page) => total + page.items.length, 0);

  return offset ?? 0;
};

export const getCacheInsertOrder = (queryKey: QueryKey): 'asc' | 'desc' => {
  // Find the object in queryKey that contains 'sort' and 'order' properties
  const sortData = queryKey.find(
    (el): el is { sort: string; order?: 'asc' | 'desc' } => typeof el === 'object' && el !== null && 'sort' in el && 'order' in el,
  );

  // If sorted by 'createdAt', return its order, otherwise 'desc'(at the top of list)
  return sortData?.sort === 'createdAt' ? (sortData.order ?? 'desc') : 'desc';
};
