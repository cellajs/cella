import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { type ContextEntitiesQuery, getContextEntities, getPageEntities, type PageEntitiesQuery } from '~/modules/entities/api';
import { useUserStore } from '~/store/user';

/**
 * Keys for entities related queries. These keys help to uniquely identify different query.
 * For managing query caching and invalidation.
 */
export const entitiesKeys = {
  all: ['entities'] as const,
  search: (searchQuery: string) => [...entitiesKeys.all, 'search', searchQuery] as const,
  grid: {
    base: () => [...entitiesKeys.all, 'greed'] as const,
    context: (filters: ContextEntitiesQuery) => [...entitiesKeys.grid.base(), filters] as const,
  },
};

/**
 * Query options for fetching page entities based on input query.
 *
 * @param query - PageEntitiesQuery parameters to get entities.
 * @returns Query options
 */
export const entitiesQueryOptions = (query: PageEntitiesQuery) => {
  const searchQuery = query.q ?? '';
  return queryOptions({
    queryKey: entitiesKeys.search(searchQuery),
    queryFn: () => getPageEntities(query),
    staleTime: 0,
    enabled: searchQuery.trim().length > 0, // to avoid issues with spaces
    initialData: { items: [], total: 0, counts: {} },
    placeholderData: keepPreviousData,
  });
};

/**
 * Query options for fetching context entities with memberhsip and their members based on userId input query and sort.
 *
 * @param query - ContextEntitiesQuery parameters to get entities.
 * @returns Query options
 */
export const contextEntitiesQueryOptions = ({ type, ...restQuery }: ContextEntitiesQuery) => {
  const user = useUserStore.getState().user;
  const q = restQuery.q ?? '';
  const sort = restQuery.sort ?? 'name';
  const targetUserId = restQuery.targetUserId ?? user.id;
  return queryOptions({
    queryKey: entitiesKeys.grid.context({ q, sort, targetUserId, type, roles: restQuery.roles }),
    queryFn: () => getContextEntities({ type, ...restQuery }),
    staleTime: 0,
  });
};
