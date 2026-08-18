import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { cacheUpdate } from '~/query/basic/cache-mutations';
import type { ItemData } from '~/query/basic/types';

/**
 * Merges only this mutation's mutated fields from the server response onto the cached entity, so a concurrent mutation's optimistic values survive; stx, updatedAt, and updatedBy always sync.
 * Returns the server entity when nothing is cached.
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
