import { queryOptions } from '@tanstack/react-query';
import { type InviteSuggestionsProps, type SuggestionsProps, getInviteSuggestions, getSuggestions } from '~/modules/general/api';

// Keys for general queries
export const generalKeys = {
  check: ['check'] as const,
  search: ['search'] as const,
  suggestions: (value: string) => ['search', value] as const,
  inviteSuggestions: (value: string) => ['invite', ...generalKeys.suggestions(value)] as const,
  checkToken: () => [...generalKeys.check, 'token'] as const,
  checkSlug: () => [...generalKeys.check, 'slug'] as const,
  acceptInvite: ['invite', 'accept'] as const,
};

export const suggestionsQueryOptions = (queryInfo: SuggestionsProps) => {
  const { q: searchQuery } = queryInfo;
  return queryOptions({
    queryKey: generalKeys.suggestions(searchQuery),
    queryFn: () => getSuggestions(queryInfo),
    staleTime: 0,
    enabled: searchQuery.trim().length > 0, // to avoid issues with spaces
    initialData: { items: [], total: 0 },
  });
};

export const inviteSuggestionsQueryOptions = (queryInfo: InviteSuggestionsProps) => {
  const { q: searchQuery } = queryInfo;
  return queryOptions({
    queryKey: generalKeys.inviteSuggestions(searchQuery),
    queryFn: () => getInviteSuggestions(queryInfo),
    staleTime: 0,
    enabled: searchQuery.trim().length > 0, // to avoid issues with spaces
    initialData: [],
  });
};
