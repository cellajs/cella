import type { QueryKey, UseInfiniteQueryOptions, UseQueryOptions } from '@tanstack/react-query';

export type QueryData<T> = {
  items: T[];
  total: number;
};

export type InfiniteQueryData<T> = {
  pageParams: number[];
  pages: QueryData<T>[];
};

export type ContextProp<T, K> = [QueryKey, QueryData<T> | InfiniteQueryData<T> | undefined, K];

export type InferType<T> = T extends UseQueryOptions<infer D> ? D : T extends UseInfiniteQueryOptions<infer D> ? D : never;
