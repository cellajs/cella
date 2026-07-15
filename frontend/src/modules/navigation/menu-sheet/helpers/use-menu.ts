import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { channelEntityListQueriesByType } from '~/list-queries-config';
import { buildMenuFromCache, menuEntityTypes } from './build-menu-from-cache';

/**
 * React hook that fetches and builds the user menu from the user's memberships. Subscribes to entity
 * list queries for granular reactivity: when the cache subscriber enriches data, useQueries detects
 * the update and re-builds the menu. Queries are disabled when `userId` is undefined.
 */
export function useMenu(userId: string | undefined) {
  // Subscribe to each entity list query for granular reactivity
  const results = useQueries({
    // @ts-expect-error useQueries types don't support infinite query options, but it works at runtime
    queries: menuEntityTypes.map((t) => ({
      ...channelEntityListQueriesByType[t]?.({ relatableUserId: userId ?? '' }),
      enabled: !!userId,
    })),
  });

  // Stable recompute key when query data changes
  const recomputeKey = results.map((r) => r.dataUpdatedAt).join('|');

  // Build menu from cache using shared logic with getMenuData.
  const menu = useMemo(() => (userId ? buildMenuFromCache(userId) : buildMenuFromCache('')), [userId, recomputeKey]);

  const isLoading = results.some((r) => r.isLoading || r.isPending);
  const error = results.find((r) => r.error)?.error;

  return { menu, isLoading, error };
}
