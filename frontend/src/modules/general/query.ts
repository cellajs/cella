import { queryOptions } from '@tanstack/react-query';
import { getSuggestions } from '~/modules/general/api';
import type { PageEntity } from '~/types/common';

// Keys for general queries
export const generalKeys = {
  check: ['check'] as const,
  search: (value: string) => ['search', value] as const,
  checkToken: () => [...generalKeys.check, 'token'] as const,
  checkSlug: () => [...generalKeys.check, 'slug'] as const,
  acceptInvite: ['invite', 'accept'] as const,
};

export const searchQueryOptions = (searchQuery: string, entity?: PageEntity | undefined) =>
  queryOptions({
    queryKey: generalKeys.search(searchQuery),
    queryFn: () => getSuggestions(searchQuery, entity),
    staleTime: 0,
    enabled: searchQuery.trim().length > 0, // to avoid issues with spaces
    initialData: { items: [], total: 0 },
  });
