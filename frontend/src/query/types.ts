import type { InfiniteData, QueryKey, UseInfiniteQueryOptions, UseQueryOptions, useInfiniteQuery } from '@tanstack/react-query';

export type QueryData<TItem> = {
  items: TItem[];
  total: number;
};

export type PageParams = {
  page: number;
  offset: number;
};
export type InfiniteQueryData<TItem, TPageParam = PageParams> = InfiniteData<QueryData<TItem>, TPageParam>;

export type BaseQueryItem<TItem, TPageParam = PageParams> = QueryData<TItem> | InfiniteQueryData<TItem, TPageParam>;
export type BaseQueryResponce<TItem, TPageParam = PageParams> = [QueryKey, BaseQueryItem<TItem, TPageParam> | undefined];

export type ContextQueryProp<TItem, TOptimisticId = undefined, TPageParam = PageParams> = TOptimisticId extends undefined | null
  ? BaseQueryResponce<TItem, TPageParam>
  : [...BaseQueryResponce<TItem, TPageParam>, TOptimisticId];

export type ContextProp<T, K = undefined> = K extends undefined | null ? [QueryKey, T | undefined] : [QueryKey, T | undefined, K];

export type InferType<T> = T extends UseQueryOptions<infer D> ? D : T extends UseInfiniteQueryOptions<infer D> ? D : never;

export type InfiniteOptions<T, TQueryKey extends QueryKey = QueryKey> = Parameters<
  typeof useInfiniteQuery<T, Error, InfiniteData<T, unknown>, TQueryKey, PageParams>
>[0];
