import { queryOptions } from '@tanstack/react-query';
import type { PageEntity } from 'config';
import { getSuggestions } from '~/modules/general/api';

/**
 * Query options for fetching search suggestions based on the input query.
 * If the search query is empty, the queryOptions will be disabled.
 *
 * @param searchQuery - Search query to filter results by.
 * @param entity - Optional, entity filter to narrow the search results.
 * @returns Query options
 */
// TODO: can we benefit from cache?
export const searchQueryOptions = (searchQuery: string, entity?: PageEntity | undefined) =>
  queryOptions({
    queryKey: ['search', searchQuery],
    queryFn: () => getSuggestions(searchQuery, entity),
    staleTime: 0,
    enabled: searchQuery.trim().length > 0, // to avoid issues with spaces
    initialData: { items: [], total: 0 },
  });
