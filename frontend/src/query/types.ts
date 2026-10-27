import type { InfiniteData, QueryKey, UseInfiniteQueryOptions } from '@tanstack/react-query';
import type { ChannelEntityType, EntityType } from 'shared';
import type { ApiError } from '~/lib/api';
import type { EnrichedChannel } from '~/modules/entities/types';

/** Mutation variables of a generated `*Data` type: the request without its `url`. */
export type MutationData<T> = Omit<T, 'url'>;

export type QueryData<TItem> = { items: TItem[]; total: number };

export type PageParams = { page: number; offset: number };
export type InfiniteQueryData<TItem, TPageParam = PageParams> = InfiniteData<QueryData<TItem>, TPageParam>;

export type BaseQueryItem<TItem, TPageParam = PageParams> = QueryData<TItem> | InfiniteQueryData<TItem, TPageParam>;
export type BaseQueryResponse<TItem, TPageParam = PageParams> = [QueryKey, BaseQueryItem<TItem, TPageParam> | undefined];

export type ChannelQueryProp<TItem, TOptimisticId = undefined, TPageParam = PageParams> = TOptimisticId extends undefined | null
  ? BaseQueryResponse<TItem, TPageParam>
  : [...BaseQueryResponse<TItem, TPageParam>, TOptimisticId];

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
  PageParams
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
