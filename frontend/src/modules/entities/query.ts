import { infiniteQueryOptions, keepPreviousData, queryOptions } from '@tanstack/react-query';
import { appConfig, type PageEntityType } from 'config';
import { getContextEntities, type GetContextEntitiesData } from '~/api.gen';
import type { ContextEntityItems } from '~/modules/entities/types';
import { baseInfiniteQueryOptions } from '~/query/utils/infinite-query-options';
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
 * Query options for fetching context entities based on input query.
 *
 * @param query.q - Optional search term to filter entities.
 * @param query.types - One or more `ContextEntityTypes`.
 * @param query.targetUserId - ID of user to scope search to.
 * @param query.targetOrgId - ID of organization to scope search to.
 * @returns Query options
 */
export const searchContextEntitiesQueryOptions = ({
  q = '',
  types,
  targetUserId,
  targetOrgId,
}: Pick<NonNullable<GetContextEntitiesData['query']>, 'q' | 'types' | 'targetUserId' | 'targetOrgId'>) => {
  const orgAffiliated = 'true';

  return queryOptions({
    queryKey: entitiesKeys.search(q),
    queryFn: () => getContextEntities({ query: { q, types, targetUserId, targetOrgId, orgAffiliated } }),
    staleTime: 0,
    enabled: q.trim().length > 0, // to avoid issues with spaces
    initialData: {
      items: Object.fromEntries(appConfig.contextEntityTypes.map((t) => [t, []])) as unknown as ContextEntityItems,
      total: 0,
    },
    placeholderData: keepPreviousData,
  });
};

/**
 * Infinite Query Options for fetching a paginated list of context entities.
 *
 * @param query.q - Optional search term to filter entities.
 * @param query.sort - Field to sort results by (default: 'name').
 * @param query.types - One or more `ContextEntityTypes`.
 * @param query.role - Optional role filter for entities.
 * @param query.excludeArchived - Whether to exclude archived entities.
 * @param query.limit - Maximum number of entities to fetch per page (default: appConfig.requestLimits.default).
 * @param query.targetUserId - ID of user to scope search to (defaults to current user).
 *
 * @returns Infinite query options.
 */
export const contextEntitiesQueryOptions = ({
  q = '',
  sort = 'name',
  types,
  role,
  excludeArchived,
  limit: baseLimit = appConfig.requestLimits.default,
  targetUserId = useUserStore.getState().user.id,
}: Omit<NonNullable<GetContextEntitiesData['query']>, 'targetOrgId' | 'orgAffiliated' | 'order' | 'limit'> & { limit?: number }) => {
  const limit = String(baseLimit);
  const orgAffiliated = 'false';
  const { initialPageParam } = baseInfiniteQueryOptions;

  return infiniteQueryOptions({
    queryKey: entitiesKeys.grid.context({ q, sort, targetUserId, types, role }),
    initialPageParam,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset || (page || 0) * Number(limit));
      return await getContextEntities({ query: { q, sort, types, role, targetUserId, excludeArchived, orgAffiliated, offset, limit }, signal });
    },
    getNextPageParam: (lastPage, allPages) => {
      const total = lastPage.total;

      const fetchedCount = allPages.reduce((acc, page) => {
        const pageCount = Object.values(page.items).reduce((sum, arr) => sum + arr.length, 0);
        return acc + pageCount;
      }, 0);

      if (fetchedCount >= total) return undefined;
      return { page: allPages.length, offset: fetchedCount };
    },
    staleTime: 0,
  });
};
