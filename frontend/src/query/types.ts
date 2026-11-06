import type { InfiniteData, QueryKey, UseInfiniteQueryOptions } from '@tanstack/react-query';
import type { ChannelEntityType, EntityType } from 'shared';
import type { ApiError } from '~/lib/api';
import type { EnrichedChannel } from '~/modules/entities/types';

/** Mutation variables of a generated `*Data` type: the request without its `url`. */
export type MutationData<T> = Omit<T, 'url'>;

/** A list page as the API sends it, or a whole list read page by page, which names no next page. */
export type QueryData<TItem> = {
  results: TItem[];
  totalSize: number;
  nextPageToken?: string;
};

export type SortOrder = 'asc' | 'desc';

/** The fields a list orders by: its `orderBy` values without a direction. */
export type SortFieldOf<TOrderBy> = TOrderBy extends `${infer F} ${SortOrder}` ? F : Extract<TOrderBy, string>;

/** A list request's own params as its cache key holds them: no paging, and `orderBy` as the sort and order a table names. */
export type ListFilters<TQuery> = Omit<TQuery, 'pageToken' | 'maxPageSize' | 'skip' | 'orderBy' | 'afterSeq' | 'untilSeq'> &
  ('orderBy' extends keyof TQuery ? { sort?: SortFieldOf<NonNullable<TQuery['orderBy']>>; order?: SortOrder } : unknown);

/** The page token an infinite list reads a page with: the previous page's `nextPageToken`, '' for the first page. */
export type PageParam = string;
export type InfiniteQueryData<TItem, TPageParam = PageParam> = InfiniteData<QueryData<TItem>, TPageParam>;

export type BaseQueryItem<TItem, TPageParam = PageParam> = QueryData<TItem> | InfiniteQueryData<TItem, TPageParam>;
export type BaseQueryResponse<TItem, TPageParam = PageParam> = [QueryKey, BaseQueryItem<TItem, TPageParam> | undefined];

/** Org context needed by mutation defaults for offline persistence. */
export type QueryOrgContext = { tenantId: string; organizationId: string };

/** Minimal structural query shape shared across heterogeneous query factories. */
export type QueryOptionsWithKey = { queryKey: readonly unknown[] };

/** Filters the menu, the search sheet and parent pickers pass to a channel's list query; a list ignores the ones it does not take. */
export interface ChannelListParams {
  q?: string;
  /** Channels this user is a member of. */
  relatableUserId?: string;
  /** Channels below this organization. */
  organizationId?: string;
}

/** A channel list query as the menu, the search sheet and parent pickers read it: pages of enriched channel rows. */
export type ChannelListQueryOptions = UseInfiniteQueryOptions<
  QueryData<EnrichedChannel>,
  ApiError,
  InfiniteQueryData<EnrichedChannel>,
  QueryKey,
  PageParam
>;

export type ChannelListQuery = (params: ChannelListParams) => ChannelListQueryOptions;
export type ChannelListQueryMap = Partial<Record<ChannelEntityType, ChannelListQuery>>;

/** Structural query shape used by the sync service for both standard and infinite queries. */
export type EntitySyncQueryOptions = QueryOptionsWithKey & { getNextPageParam?: unknown };

/** Input for building the set of queries to proactively sync for a target entity. */
export interface BuildEntitySyncQueriesParams {
  targetEntityId: string;
  targetEntityType: EntityType;
  tenantId: string;
  currentOrganizationId: string;
}
