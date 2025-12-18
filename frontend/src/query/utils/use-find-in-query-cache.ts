import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { flattenInfiniteData } from './flatten';

/**
 * Hook to find an entity in the query cache. Performs a one-time read without subscribing to cache changes.
 * The component will not re-render when cache data updates.
 *
 * @param queryKeys - Array of query key prefixes to search (e.g., ['user'], ['member'])
 * @param matcher - Function that returns true when the entity is found
 * @returns The found entity or null
 */
export function useFindInQueryCache<T>(queryKeys: Array<string | readonly unknown[]>, matcher: (item: T) => boolean): T | null {
  const queryClient = useQueryClient();

  return useMemo(() => {
    for (const queryKey of queryKeys) {
      const queries = queryClient.getQueryCache().findAll({ queryKey: Array.isArray(queryKey) ? queryKey : [queryKey] });

      for (const query of queries) {
        const data = query.state.data;
        const items = flattenInfiniteData<T>(data);
        const found = items.find(matcher);
        if (found) return found;
      }
    }

    return null;
  }, [queryClient, queryKeys, matcher]);
}
