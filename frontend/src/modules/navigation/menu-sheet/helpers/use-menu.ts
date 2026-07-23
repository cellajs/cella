import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { channelListQueriesByType } from '~/list-queries-config';
import { buildMenuFromCache, menuEntityTypes } from './build-menu-from-cache';

/**
 * Builds the user menu from memberships. Subscribes to entity list queries so that when the cache
 * subscriber enriches data, useQueries re-builds the menu. Disabled when `userId` is undefined.
 */
export function useMenu(userId: string | undefined) {
  // Menu structure may name an entity type with no registered list query (buildMenuFromCache
  // treats those as empty). Dropping them keeps every entry a real options object, so none
  // reaches useQueries without a queryKey.
  const queries = menuEntityTypes
    .map((entityType) => channelListQueriesByType[entityType])
    .filter((factory) => factory !== undefined)
    .map((factory) => ({ ...factory({ relatableUserId: userId ?? '' }), enabled: !!userId }));

  // Subscribe to each entity list query for granular reactivity
  const results = useQueries({
    // @ts-expect-error useQueries types don't support infinite query options, but it works at runtime
    queries,
  });

  // Stable recompute key when query data changes
  const recomputeKey = results.map((r) => r.dataUpdatedAt).join('|');

  // Build menu from cache using shared logic with getMenuData.
  const menu = useMemo(() => (userId ? buildMenuFromCache(userId) : buildMenuFromCache('')), [userId, recomputeKey]);

  const isLoading = results.some((r) => r.isLoading || r.isPending);
  const error = results.find((r) => r.error)?.error;

  return { menu, isLoading, error };
}
