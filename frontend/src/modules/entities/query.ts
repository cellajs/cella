import { queryOptions } from '@tanstack/react-query';
import { type EntitiesQuery, getEntities } from '~/modules/entities/api';

/**
 * Query options for fetching search entities based on the input query.
 * If the search query is empty, the queryOptions will be disabled.
 *
 * @param query - Query parameters to get entities.
 * @param query.q -  Optional, search query.
 * @param query.type - Optional, type of entity to filter entities by.
 * @param query.entityId - Optional, excludes entities based on membership in the specified entity.
 * @returns Query options
 */
export const searchQueryOptions = (query: EntitiesQuery) => {
  const searchQuery = query.q ?? '';
  return queryOptions({
    queryKey: ['search', searchQuery],
    queryFn: () => getEntities(query),
    staleTime: 0,
    enabled: searchQuery.trim().length > 0, // to avoid issues with spaces
    initialData: { items: [], total: 0 },
  });
};
