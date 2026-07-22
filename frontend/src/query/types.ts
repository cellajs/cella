import type { InfiniteData, QueryKey } from '@tanstack/react-query';
import type { ChannelEntityType, EntityType } from 'shared';

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
export type BaseQueryResponse<TItem, TPageParam = PageParams> = [
  QueryKey,
  BaseQueryItem<TItem, TPageParam> | undefined,
];

export type ChannelQueryProp<TItem, TOptimisticId = undefined, TPageParam = PageParams> = TOptimisticId extends
  | undefined
  | null
  ? BaseQueryResponse<TItem, TPageParam>
  : [...BaseQueryResponse<TItem, TPageParam>, TOptimisticId];

/** Org context needed by mutation defaults for offline persistence. */
export type QueryOrgContext = { tenantId: string; organizationId: string };

/** Minimal structural query shape shared across heterogeneous query factories. */
export type QueryOptionsWithKey = { queryKey: readonly unknown[] };

// biome-ignore lint/suspicious/noExplicitAny: Query factories have different parameter shapes per entity type.
export type ChannelListQueryFactory = (...args: any[]) => QueryOptionsWithKey;
export type ChannelListQueryMap = Partial<Record<ChannelEntityType, ChannelListQueryFactory>>;

/** Structural query shape used by the sync service for both standard and infinite queries. */
export type EntitySyncQueryOptions = QueryOptionsWithKey & { getNextPageParam?: unknown };

/** Input for building the set of queries to proactively sync for a target entity. */
export interface BuildEntitySyncQueriesParams {
  targetEntityId: string;
  targetEntityType: EntityType;
  tenantId: string;
  currentOrganizationId: string;
  includeMemberQueries: boolean;
}
