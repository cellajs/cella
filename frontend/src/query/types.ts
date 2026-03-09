import type { InfiniteData, QueryKey } from '@tanstack/react-query';

/** Extract usable mutation variables from a generated *Data type (strips `url` and `path`). */
export type MutationData<T> = Omit<T, 'url'>;

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
export type BaseQueryResponce<TItem, TPageParam = PageParams> = [
  QueryKey,
  BaseQueryItem<TItem, TPageParam> | undefined,
];

export type ContextQueryProp<TItem, TOptimisticId = undefined, TPageParam = PageParams> = TOptimisticId extends
  | undefined
  | null
  ? BaseQueryResponce<TItem, TPageParam>
  : [...BaseQueryResponce<TItem, TPageParam>, TOptimisticId];

/** Org context needed by mutation defaults for offline persistence. */
export type QueryOrgContext = { tenantId: string; orgId: string };
