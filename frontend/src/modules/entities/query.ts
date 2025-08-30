import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { appConfig, type PageEntityType } from 'config';
import { type GetContextEntitiesData, getContextEntities } from '~/api.gen';
import type { ContextEntityItems } from '~/modules/entities/types';
import { useUserStore } from '~/store/user';

/**
 * Keys for entities related queries. These keys help to uniquely identify different query.
 * For managing query caching and invalidation.
 */
export const entitiesKeys = {
  all: 'entities' as const,
  product: 'product' as const,
  context: 'context' as const,
  search: (searchQuery: string) => [entitiesKeys.all, entitiesKeys.context, 'search', searchQuery] as const,
  grid: {
    base: () => [entitiesKeys.all, 'greed'] as const,
    context: (filters: GetContextEntitiesData['query']) => [...entitiesKeys.grid.base(), filters] as const,
  },
  single: (idOrSlug: string, entityType: PageEntityType) => [entitiesKeys.all, entitiesKeys.context, entityType, idOrSlug] as const,
};

/**
 * Query options for fetching page entities based on input query.
 *
 * @param query - PageEntitiesQuery parameters to get entities.
 * @returns Query options
 */
export const searchContextEntitiesQueryOptions = (
  query: Pick<NonNullable<GetContextEntitiesData['query']>, 'q' | 'types' | 'targetUserId' | 'targetOrgId'>,
) => {
  const searchQuery = query.q ?? '';

  return queryOptions({
    queryKey: entitiesKeys.search(searchQuery),
    queryFn: () => getContextEntities({ query }),
    staleTime: 0,
    enabled: searchQuery.trim().length > 0, // to avoid issues with spaces
    initialData: {
      // TODO fix typing
      items: Object.fromEntries(appConfig.contextEntityTypes.map((t) => [t, []])) as unknown as ContextEntityItems,
      total: 0,
    },
    placeholderData: keepPreviousData,
  });
};

/**
 * Query options for fetching page entities based on input query.
 *
 * @param query - PageEntitiesQuery parameters to get entities.
 * @returns Query options
 */
export const contextEntitiesQueryOptions = (query: Omit<NonNullable<GetContextEntitiesData['query']>, 'targetOrgId' | 'orgAffiliated'>) => {
  const user = useUserStore.getState().user;
  const q = query.q ?? '';
  const sort = query.sort ?? 'name';
  const targetUserId = query.targetUserId ?? user.id;
  const orgAffiliated = 'false';
  return queryOptions({
    queryKey: entitiesKeys.grid.context({ q, sort, targetUserId, types: query.types, role: query.role }),
    queryFn: () => getContextEntities({ query: { ...query, sort, targetUserId, orgAffiliated } }),
    staleTime: 0,
  });
};
