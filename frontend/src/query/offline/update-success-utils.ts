import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { asRecord } from 'shared/utils/as-record';
import { cacheUpdate } from '~/query/basic/cache-mutations';
import type { ItemData } from '~/query/basic/types';

/**
 * Merges only this mutation's mutated fields from the server response onto the cached entity, so a concurrent mutation's optimistic values survive; stx, updatedAt, and updatedBy always come from the response.
 * Returns the server entity when nothing is cached.
 */
export function mergeServerResponse<T extends { id: string; stx?: unknown; updatedAt?: string | null }>(options: {
  cached?: T;
  serverEntity: T;
  mutatedKeys: string[];
  /** Per mutated key, the columns the server stamps when it stores the change (a body's keywords, a flag's actor): taken from the response with it. */
  derivedKeys?: Record<string, readonly string[]>;
  /** Mutated or derived keys left as cached. */
  skipKeys?: string[];
}): T {
  const { cached, serverEntity, mutatedKeys, derivedKeys = {}, skipKeys } = options;
  if (!cached) return serverEntity;

  const serverRow = asRecord(serverEntity);
  const serverUpdates: Record<string, unknown> = {};
  for (const key of [...mutatedKeys, ...mutatedKeys.flatMap((mutated) => derivedKeys[mutated] ?? [])]) {
    if (skipKeys?.includes(key)) continue;
    serverUpdates[key] = serverRow[key];
  }

  return {
    ...cached,
    ...serverUpdates,
    stx: serverEntity.stx,
    updatedAt: serverEntity.updatedAt,
    ...('updatedBy' in serverEntity ? { updatedBy: serverRow.updatedBy } : {}),
  };
}

export function syncEntityToCache<T extends ItemData>(options: { entity: T; listKey: QueryKey; detailKey: QueryKey; queryClient: QueryClient }) {
  const { entity, listKey, detailKey, queryClient } = options;
  cacheUpdate(listKey, [entity]);
  queryClient.setQueryData<T>(detailKey, (old) => old && { ...old, ...entity });
}
