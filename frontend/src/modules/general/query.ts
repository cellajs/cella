import { queryOptions } from '@tanstack/react-query';
import type { PageEntity } from 'config';
import { getSuggestions } from '~/modules/general/api';

// TODO: can we benefit from cache?
export const searchQueryOptions = (searchQuery: string, entity?: PageEntity | undefined) =>
  queryOptions({
    queryKey: ['search', searchQuery],
    queryFn: () => getSuggestions(searchQuery, entity),
    staleTime: 0,
    enabled: searchQuery.trim().length > 0, // to avoid issues with spaces
    initialData: { items: [], total: 0 },
  });
