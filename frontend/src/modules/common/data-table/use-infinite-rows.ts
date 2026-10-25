import { type InfiniteData, type QueryKey, type UseInfiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';
import type { QueryData } from '~/query/types';

/** Flattens a paged list query into table rows. */
export function useInfiniteRows<TRow, TError, TQueryKey extends QueryKey, TPageParam>(
  options: UseInfiniteQueryOptions<QueryData<TRow>, TError, InfiniteData<QueryData<TRow>>, TQueryKey, TPageParam>,
) {
  const {
    data: rows,
    isLoading,
    isFetching,
    error,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({ ...options, select: ({ pages }) => pages.flatMap(({ items }) => items) });

  return { rows, isLoading, isFetching, error, hasNextPage, fetchMore: fetchNextPage };
}
