/**
 * Small composable helpers for mutation onSuccess handlers.
 *
 * - patchStxFields: merge stx/modifiedAt/modifiedBy from server onto cached entity
 * - syncEntityToCache: write entity to both list + detail cache
 */

import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { ItemData, UseMutateQueryDataReturn } from '~/query/basic/types';

/** Minimal entity shape with stx tracking fields. */
type StxEntity = ItemData & {
  stx: unknown;
  modifiedAt: unknown;
  modifiedBy?: unknown;
};

/**
 * Patch only stx/modifiedAt/modifiedBy from the server entity onto a cached entity.
 * Returns the patched entity, or undefined if cached is undefined.
 *
 * Use when another mutation is pending for the same entity — preserves
 * optimistic field values while keeping version metadata in sync.
 */
export function patchStxFields<T extends StxEntity>(cached: T | undefined, server: T): T | undefined {
  if (!cached) return undefined;
  return {
    ...cached,
    stx: server.stx,
    modifiedAt: server.modifiedAt,
    ...('modifiedBy' in server ? { modifiedBy: server.modifiedBy } : {}),
  };
}

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
  queryClient.setQueryData<T>(detailKey, (old) => (old ? { ...old, ...entity } : old));
}
