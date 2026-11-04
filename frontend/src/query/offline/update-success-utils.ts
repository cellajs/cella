import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { asRecord } from 'shared/utils/as-record';
import { getYjsOwnedFields, guardYjsOwnedFields } from '~/modules/common/blocknote/yjs-owned-fields';
import { cacheUpdate, writeKeepingMark } from '~/query/basic/cache-mutations';
import type { ItemData } from '~/query/basic/types';
import { hasMutationOfRow, isQueued } from '~/query/offline/mutation-queue';

/**
 * The cached row once a mutation of it settled. With no other mutation of the row queued, every field the stored row
 * carries replaces the cached one, so a remote edit kept from the cache while the mutation was pending arrives: the
 * server arbitrated the write by its stx. A Yjs-owned field stays as cached unless the server wrote it. With another
 * mutation of the row queued, only this mutation's fields and the stamps come from the response, so that mutation's
 * optimistic values survive until it settles in turn.
 * Returns the server entity when nothing is cached.
 */
export function mergeServerResponse<T extends { id: string; entityType: string; stx?: unknown; updatedAt?: string | null }>(options: {
  queryClient: QueryClient;
  cached?: T;
  serverEntity: T;
  mutatedKeys: string[];
  /**
   * Per mutated key, the columns the server stamps when it stores the change (a flag's actor): taken from the response
   * with it. A description brings its registered columns (`registerDescriptionColumns`).
   */
  // A description entry is never read: the registered description columns decide what a description write derives.
  derivedKeys?: Record<string, readonly string[]> & { description?: never };
  /** Keys left as cached: fields the response does not carry, such as the stubbed relations of a lite response. A remote change of one arrives with the next read of the list. */
  skipKeys?: string[];
}): T {
  const { queryClient, cached, serverEntity, mutatedKeys, derivedKeys = {}, skipKeys = [] } = options;
  if (!cached) return serverEntity;

  const serverRow = asRecord(serverEntity);
  const skipped = Object.fromEntries(skipKeys.filter((key) => key in cached).map((key) => [key, asRecord(cached)[key]]));

  // The settling mutation is running, so a queued one is another mutation of the row.
  if (!hasMutationOfRow(queryClient, serverEntity.entityType, serverEntity.id, isQueued)) {
    return { ...cached, ...guardYjsOwnedFields(serverEntity.entityType, serverEntity, cached), ...skipped };
  }

  const serverUpdates: Record<string, unknown> = {};
  const derivedFrom = (mutated: string) => (mutated === 'description' ? getYjsOwnedFields(serverEntity.entityType) : (derivedKeys[mutated] ?? []));
  for (const key of [...mutatedKeys, ...mutatedKeys.flatMap(derivedFrom)]) {
    if (!skipKeys.includes(key)) serverUpdates[key] = serverRow[key];
  }

  return {
    ...cached,
    ...serverUpdates,
    stx: serverEntity.stx,
    updatedAt: serverEntity.updatedAt,
    ...('updatedBy' in serverEntity ? { updatedBy: serverRow.updatedBy } : {}),
  };
}

export function writeEntityToCache<T extends ItemData>(options: { entity: T; listKey: QueryKey; detailKey: QueryKey; queryClient: QueryClient }) {
  const { entity, listKey, detailKey, queryClient } = options;
  cacheUpdate(listKey, [entity]);
  writeKeepingMark<T>(queryClient, detailKey, (old) => old && { ...old, ...entity });
}
