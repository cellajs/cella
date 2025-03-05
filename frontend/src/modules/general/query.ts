import { queryOptions } from '@tanstack/react-query';
import { type SuggestionsQuery, getSuggestions } from '~/modules/general/api';

/**
 * Query options for fetching search suggestions based on the input query.
 * If the search query is empty, the queryOptions will be disabled.
 *
 * @param query - Query parameters to get suggestions.
 * @param query.q -  Optional, search query.
 * @param query.type - Optional, type of entity to filter suggestions by.
 * @param query.entityId - Optional, excludes suggestions based on membership in the specified entity.
 * @returns Query options
 */
export const searchQueryOptions = (query: SuggestionsQuery) => {
  const searchQuery = query.q ?? '';
  return queryOptions({
    queryKey: ['search', searchQuery],
    queryFn: () => getSuggestions(query),
    staleTime: 0,
    enabled: searchQuery.trim().length > 0, // to avoid issues with spaces
    initialData: { items: [], total: 0 },
  });
};
