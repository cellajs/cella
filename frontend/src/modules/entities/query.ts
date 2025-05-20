import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { type EntitiesQuery, getEntities } from '~/modules/entities/api';

/**
 * Query options for fetching entities based on input query.
 *
 * @param query - EntitiesQuery parameters to get entities.
 * @returns Query options
 */
export const entitiesQueryOptions = (query: EntitiesQuery) => {
  const searchQuery = query.q ?? '';
  return queryOptions({
    queryKey: ['search', searchQuery],
    queryFn: () => getEntities(query),
    staleTime: 0,
    enabled: searchQuery.trim().length > 0, // to avoid issues with spaces
    initialData: { items: [], total: 0, counts: {} },
    placeholderData: keepPreviousData,
  });
};
