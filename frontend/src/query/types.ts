import type { QueryKey, UseInfiniteQueryOptions, UseQueryOptions } from '@tanstack/react-query';

export type QueryData<T> = {
  items: T[];
  total: number;
};

export type InfiniteQueryData<T> = {
  pageParams: number[];
  pages: QueryData<T>[];
};

export type ContextQueryProp<T, K = undefined> = K extends undefined | null
  ? [QueryKey, QueryData<T> | InfiniteQueryData<T> | undefined]
  : [QueryKey, QueryData<T> | InfiniteQueryData<T> | undefined, K];
export type ContextProp<T, K = undefined> = K extends undefined | null ? [QueryKey, T | undefined] : [QueryKey, T | undefined, K];

export type InferType<T> = T extends UseQueryOptions<infer D> ? D : T extends UseInfiniteQueryOptions<infer D> ? D : never;
