import { useMemo } from 'react';
import { queryClient } from '~/query/query-client';
import { flattenInfiniteData } from './flatten';

/**
 * Per-entity-type frame cache for O(1) lookups.
 * Each entity type (task, label, page, etc.) has its own isolated Map + TTL
 * so concurrent lookups across different types never interfere.
 */
const entityCaches = new Map<string, { map: Map<string, unknown>; builtAt: number }>();
const cacheTtlMs = 100;

/**
 * Find an entity in query list caches by entity type.
 * Flattens all list queries for the given entity type into a Map (cached per
 * entity type with a 100ms TTL) and returns the match.
 *
 * @param entityType - Entity type to search (e.g., 'task', 'label', 'member')
 * @param matcher - Entity ID string or predicate function
 * @returns The found entity or undefined
 */
export function findEntityInListCache<T extends { id: string }>(
  entityType: string,
  matcher: string | ((item: T) => boolean),
): T | undefined {
  const now = performance.now();
  let entry = entityCaches.get(entityType);

  // Rebuild this entity type's cache if expired or missing
  if (!entry || now - entry.builtAt > cacheTtlMs) {
    const map = new Map<string, unknown>();
    const queryKey = [entityType, 'list'];
    const queries = queryClient.getQueryCache().findAll({ queryKey });

    for (const query of queries) {
      // biome-ignore lint/suspicious/noExplicitAny: cache data is untyped
      const items = flattenInfiniteData<T>(query.state.data as any);
      for (const item of items) {
        if (item && typeof item === 'object' && 'id' in item) {
          map.set((item as { id: string }).id, item);
        }
      }
    }

    entry = { map, builtAt: now };
    entityCaches.set(entityType, entry);
  }

  // Fast path: ID lookup is O(1)
  if (typeof matcher === 'string') {
    return entry.map.get(matcher) as T | undefined;
  }

  // Custom matcher: iterate cached values
  for (const item of entry.map.values()) {
    if (matcher(item as T)) return item as T;
  }

  return undefined;
}

/**
 * Hook: search for an entity across one or more entity types.
 *
 * @param entityTypes - Entity types to search (e.g., ['user', 'member'])
 * @param matcher - Entity ID string or predicate function
 * @returns The found entity or null
 */
export function useFindEntityInListCache<T extends { id: string }>(
  entityTypes: string[],
  matcher: string | ((item: T) => boolean),
): T | null {
  return useMemo(() => {
    for (const entityType of entityTypes) {
      const found = findEntityInListCache<T>(entityType, matcher);
      if (found) return found;
    }
    return null;
  }, [entityTypes, matcher]);
}
