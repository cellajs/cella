import { useMemo } from 'react';
import { queryClient } from '~/query/query-client';
import { flattenInfiniteData } from './flatten';

// Frame-scoped cache to avoid rebuilding for every call in the same render cycle
let cachedMap: Map<string, unknown> = new Map();
let cacheTimestamp: number | null = null;
const cacheTimeoutMs = 100;

/**
 * Find an entity in the query list cache by id or custom matcher.
 * Uses a frame-scoped cache (100ms TTL) to optimize lookups when called many times.
 *
 * @param queryKey - Query key prefix to search (e.g., ['page', 'list'])
 * @param matcher - ID string or function that returns true when the entity is found
 * @returns The found entity or undefined
 */
export function findInListCache<T extends { id: string }>(
  queryKey: readonly unknown[],
  matcher: string | ((item: T) => boolean),
): T | undefined {
  const now = performance.now();

  // Rebuild cache if expired or first call
  if (cacheTimestamp === null || now - cacheTimestamp > cacheTimeoutMs) {
    cachedMap = new Map();
    cacheTimestamp = now;

    const queries = queryClient.getQueryCache().findAll({ queryKey });

    for (const query of queries) {
      // biome-ignore lint/suspicious/noExplicitAny: cache data is untyped
      const items = flattenInfiniteData<T>(query.state.data as any);
      for (const item of items) {
        if (item && typeof item === 'object' && 'id' in item) {
          cachedMap.set((item as { id: string }).id, item);
        }
      }
    }
  }

  // Fast path: ID lookup is O(1)
  if (typeof matcher === 'string') {
    return cachedMap.get(matcher) as T | undefined;
  }

  // Custom matcher: iterate cached values
  for (const item of cachedMap.values()) {
    if (matcher(item as T)) return item as T;
  }

  return undefined;
}

/**
 * Hook wrapper for findInListCache. Searches multiple query keys.
 * Uses the same frame-scoped cache (100ms TTL) for optimized lookups.
 *
 * @param queryKeys - Array of query key prefixes to search (e.g., [['user'], ['member']])
 * @param matcher - ID string or function that returns true when the entity is found
 * @returns The found entity or null
 */
export function useFindInListCache<T extends { id: string }>(
  queryKeys: Array<string | readonly unknown[]>,
  matcher: string | ((item: T) => boolean),
): T | null {
  return useMemo(() => {
    for (const queryKey of queryKeys) {
      const key = Array.isArray(queryKey) ? queryKey : [queryKey];
      const found = findInListCache<T>(key, matcher);
      if (found) return found;
    }
    return null;
  }, [queryKeys, matcher]);
}
