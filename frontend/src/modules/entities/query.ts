import { infiniteQueryOptions, keepPreviousData, queryOptions } from '@tanstack/react-query';
import { appConfig, ContextEntityType } from 'config';
import { type GetContextEntitiesData, getContextEntities } from '~/api.gen';
import { baseInfiniteQueryOptions } from '~/query/utils/infinite-query-options';
import { useUserStore } from '~/store/user';

/**
 * Keys for entities related queries. These keys help to uniquely identify different queries.
 * For managing query caching and invalidation.
 */
const keys = {
  all: 'entities',
  product: 'product',
  context: 'context',
  search: (searchQuery: string) => ['entities', 'context', 'search', searchQuery],
  grid: {
    base: ['entities', 'grid'],
    context: (filters: GetContextEntitiesData['query']) => [...keys.grid.base, filters],
  },
  single: (idOrSlug: string, entityType: ContextEntityType | 'user') => [keys.all, keys.context, entityType, idOrSlug] as const,
};

export const entitiesKeys = keys;

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
      items: [],
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

  return infiniteQueryOptions({
    queryKey: entitiesKeys.grid.context({ q, sort, targetUserId, types, role }),
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset || (page || 0) * Number(limit));
      return await getContextEntities({ query: { q, sort, types, role, targetUserId, excludeArchived, orgAffiliated, offset, limit }, signal });
    },
    ...baseInfiniteQueryOptions,
    staleTime: 0,
  });
};
