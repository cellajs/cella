import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getContextEntityTypeToListQueries } from '~/offline-config';
import { buildMenuFromCache, menuEntityTypes } from './build-menu-from-cache';

/**
 * React hook that fetches and builds the user menu based on their memberships.
 * Subscribes to entity list queries for granular reactivity — when the cache
 * subscriber enriches data, useQueries detects the update and re-builds the menu.
 *
 * @param userId - The ID of the user to fetch menu data for (optional - queries disabled when undefined)
 * @param opts - Optional configuration for building detailed menu with submenus
 * @returns An object containing the menu, loading state, and any errors
 */
export function useMenu(userId: string | undefined) {
  // Memoize registry so useQueries sees stable configs across renders
  const contextEntityQueryRegistry = useMemo(() => getContextEntityTypeToListQueries(), []);

  // Subscribe to each entity list query for granular reactivity
  const results = useQueries({
    // @ts-expect-error useQueries types don't support infinite query options, but it works at runtime
    queries: menuEntityTypes.map((t) => ({
      ...contextEntityQueryRegistry[t]?.({ relatableUserId: userId ?? '' }),
      enabled: !!userId,
    })),
  });

  // Stable recompute key when query data changes
  const recomputeKey = results.map((r) => r.dataUpdatedAt).join('|');

  // Build menu from cache — shared logic with getMenuData
  const menu = useMemo(() => (userId ? buildMenuFromCache(userId) : buildMenuFromCache('')), [userId, recomputeKey]);

  const isLoading = results.some((r) => r.isLoading || r.isPending);
  const error = results.find((r) => r.error)?.error;

  return { menu, isLoading, error };
}
