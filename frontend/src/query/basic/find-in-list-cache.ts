import type { QueryKey } from '@tanstack/react-query';
import { queryClient } from '~/query/query-client';
import { flattenInfiniteData } from './flatten';

/**
 * Find an entity by checking the detail cache first, then falling back to list caches.
 * Supports both ID string and predicate matching.
 */
export function findInCache<T extends { id: string }>(
  entityType: string,
  matcher: string | ((item: T) => boolean),
): T | undefined {
  // Fast path: check detail cache when looking up by ID
  if (typeof matcher === 'string') {
    const detailKey: QueryKey = [entityType, 'detail', matcher];
    const detail = queryClient.getQueryData<T>(detailKey);
    if (detail) return detail;
  }

  const queryKey = [entityType, 'list'];
  const queries = queryClient.getQueryCache().findAll({ queryKey });
  const predicate = typeof matcher === 'string' ? (item: T) => item.id === matcher : matcher;

  for (const query of queries) {
    // flattenInfiniteData handles both flat { items } and infinite { pages: [{ items }] }
    // biome-ignore lint/suspicious/noExplicitAny: cache data is untyped
    const items = flattenInfiniteData<T>(query.state.data as any);
    const found = items.find(predicate);
    if (found) return found;
  }

  return undefined;
}

/**
 * Create a typed cache finder bound to an entity type.
 */
export function createCacheFinder<T extends { id: string }>(entityType: string) {
  return (matcher: string | ((item: T) => boolean)): T | undefined => findInCache<T>(entityType, matcher);
}
