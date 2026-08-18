import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { channelListQueriesByType } from '~/list-queries-config';
import { buildMenuFromCache, menuEntityTypes } from './build-menu-from-cache';

/** Subscribes to the entity list queries, so the menu rebuilds when the cache subscriber enriches their data. */
export function useMenu(userId: string | undefined) {
  // Entity types without a registered list query are dropped here, so no entry reaches useQueries without a queryKey.
  const queries = menuEntityTypes
    .map((entityType) => channelListQueriesByType[entityType])
    .filter((factory) => factory !== undefined)
    .map((factory) => ({ ...factory({ relatableUserId: userId ?? '' }), enabled: !!userId }));

  const results = useQueries({
    // @ts-expect-error useQueries types don't support infinite query options, but it works at runtime
    queries,
  });

  const recomputeKey = results.map((r) => r.dataUpdatedAt).join('|');

  const menu = useMemo(() => (userId ? buildMenuFromCache(userId) : buildMenuFromCache('')), [userId, recomputeKey]);

  const isLoading = results.some((r) => r.isLoading || r.isPending);
  const error = results.find((r) => r.error)?.error;

  return { menu, isLoading, error };
}
