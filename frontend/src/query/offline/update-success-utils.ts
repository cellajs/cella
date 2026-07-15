import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { cacheUpdate } from '~/query/basic/cache-mutations';
import type { ItemData } from '~/query/basic/types';

/**
 * Merge only the mutated fields from the server response onto the cached entity.
 * Preserves optimistic values for fields that weren't part of this mutation,
 * while always syncing stx, updatedAt, and updatedBy from the server.
 *
 * Returns the server entity directly when no cached version exists.
 */
export function mergeServerResponse<T extends { id: string; stx?: unknown; updatedAt?: string | null }>(opts: {
  cached?: T;
  serverEntity: T;
  mutatedKeys: string[];
  skipKeys?: string[];
}): T {
  const { cached, serverEntity, mutatedKeys, skipKeys } = opts;
  if (!cached) return serverEntity;

  const serverUpdates: Record<string, unknown> = {};
  for (const key of mutatedKeys) {
    if (skipKeys?.includes(key)) continue;
    serverUpdates[key] = (serverEntity as Record<string, unknown>)[key];
  }

  return {
    ...cached,
    ...serverUpdates,
    stx: serverEntity.stx,
    updatedAt: serverEntity.updatedAt,
    ...('updatedBy' in serverEntity ? { updatedBy: (serverEntity as Record<string, unknown>).updatedBy } : {}),
  } as T;
}

/**
 * Write an entity to both the list cache and the detail cache.
 */
export function syncEntityToCache<T extends ItemData>(opts: {
  entity: T;
  listKey: QueryKey;
  detailKey: QueryKey;
  queryClient: QueryClient;
}) {
  const { entity, listKey, detailKey, queryClient } = opts;
  cacheUpdate(listKey, [entity]);
  queryClient.setQueryData<T>(detailKey, (old) => {
    if (!old) return old;
    return { ...old, ...entity };
  });
}
