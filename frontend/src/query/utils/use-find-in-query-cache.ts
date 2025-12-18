import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';
import { flattenInfiniteData } from './flatten';

/**
 * Find an entity in the query cache by searching through all queries that match the given query keys.
 *
 * @param queryClient - The React Query client instance
 * @param queryKeys - Array of query key prefixes to search (e.g., ['user'], ['member'])
 * @param matcher - Function that returns true when the entity is found
 * @returns The found entity or null
 */
function findInQueryCache<T>(queryClient: QueryClient, queryKeys: Array<string | readonly unknown[]>, matcher: (item: T) => boolean): T | null {
  for (const queryKey of queryKeys) {
    const queries = queryClient.getQueriesData<any>({ queryKey: Array.isArray(queryKey) ? queryKey : [queryKey] });

    for (const [, data] of queries) {
      const items = flattenInfiniteData<T>(data);
      const found = items.find(matcher);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Hook to find an entity in the query cache with automatic subscription to cache changes.
 *
 * @param queryKeys - Array of query key prefixes to search (e.g., ['user'], ['member'])
 * @param matcher - Function that returns true when the entity is found
 * @returns The found entity or null
 */
export function useFindInQueryCache<T>(queryKeys: Array<string | readonly unknown[]>, matcher: (item: T) => boolean): T | null {
  const queryClient = useQueryClient();

  const getSnapshot = useCallback(() => findInQueryCache<T>(queryClient, queryKeys, matcher), [queryClient, queryKeys, matcher]);

  return useSyncExternalStore((onStoreChange) => queryClient.getQueryCache().subscribe(onStoreChange), getSnapshot, getSnapshot);
}
