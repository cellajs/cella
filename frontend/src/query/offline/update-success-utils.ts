/**
 * Helper for mutation onSuccess handlers.
 *
 * syncEntityToCache: write entity to both list + detail cache
 */

import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { ItemData, UseMutateQueryDataReturn } from '~/query/basic/types';

/**
 * Write an entity to both the list cache (via mutateCache) and the detail cache.
 * When `patch` is provided, writes the patch; otherwise writes the full entity.
 *
 * - List cache: mutateCache.update([entity])
 * - Detail cache: setQueryData with guard to avoid creating entries that were never fetched
 */
export function syncEntityToCache<T extends ItemData>(opts: {
  entity: T;
  detailKey: QueryKey;
  mutateCache: UseMutateQueryDataReturn;
  queryClient: QueryClient;
}) {
  const { entity, detailKey, mutateCache, queryClient } = opts;
  mutateCache.update([entity]);
  queryClient.setQueryData<T>(detailKey, (old) => {
    if (!old) return old;
    return { ...old, ...entity };
  });
}
