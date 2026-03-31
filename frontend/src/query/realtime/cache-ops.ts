/**
 * Pure cache operation primitives for entity sync.
 * Used by both live handler and catchup processor.
 */

import type { ProductEntityType } from 'shared';
import { useYjsEditorStore } from '~/modules/common/blocknote/yjs-editor';
import {
  type EntityQueryKeys,
  getEntityDeltaFetch,
  getEntityQueryKeys,
  hasEntityQueryKeys,
} from '~/query/basic/entity-query-registry';
import { changeInfiniteQueryData, changeQueryData } from '~/query/basic/helpers';
import { isInfiniteQueryData, isQueryData } from '~/query/basic/mutate-query';
import type { EntityQueryData, InfiniteEntityQueryData, ItemData } from '~/query/basic/types';
import { queryClient } from '~/query/query-client';
import { removeCacheToken, storeCacheToken } from './cache-token-store';

/**
 * Check if an entity has any pending (in-flight or paused) mutation.
 * When true, remote cache writes should be skipped to preserve optimistic state.
 * The mutation's own onSuccess will reconcile the cache when it settles.
 *
 * Checks update, create, and delete mutation keys following the standard
 * [entityType, 'update'|'create'|'delete'] convention from createEntityKeys.
 */
export function hasPendingMutationForEntity(entityType: string, entityId: string): boolean {
  const mutationCache = queryClient.getMutationCache();
  for (const suffix of ['update', 'create', 'delete'] as const) {
    const mutations = mutationCache.findAll({ mutationKey: [entityType, suffix] });
    for (const mutation of mutations) {
      if (mutation.state.status !== 'pending') continue;
      const variables = mutation.state.variables as { id?: string } | { id?: string }[] | undefined;
      if (Array.isArray(variables)) {
        if (variables.some((v) => v.id === entityId)) return true;
      } else if (variables?.id === entityId) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Patch only the stx metadata on a cached entity (detail + list caches).
 * Used by echo-prevented SSE notifications to keep HLC timestamp metadata fresh
 * without overwriting optimistic field values or triggering refetches.
 *
 * Mutates stx IN-PLACE to avoid creating new object references, which would
 * trigger React Query observer notifications and expensive board re-renders.
 * stx is conflict-resolution metadata never rendered in the UI.
 */
export function patchEntityStxInCache(
  entityType: string,
  entityId: string,
  stx: { fieldTimestamps?: Record<string, string> },
  organizationId?: string,
): void {
  if (!hasEntityQueryKeys(entityType)) return;

  const keys = getEntityQueryKeys(entityType);

  type StxEntity = { id: string; stx?: Record<string, unknown> };

  // Mutate stx in-place on a single item (no new object reference)
  const patchInPlace = (item: StxEntity): void => {
    if (!item.stx) return;
    item.stx.fieldTimestamps = stx.fieldTimestamps;
  };

  // Patch detail cache in-place
  const detail = queryClient.getQueryData<StxEntity>(keys.detail.byId(entityId));
  if (detail?.stx) patchInPlace(detail);

  // Patch list caches in-place (scoped to org when available)
  const listPrefix = organizationId ? keys.list.org(organizationId) : keys.list.base;
  for (const [, queryData] of queryClient.getQueriesData({ queryKey: listPrefix })) {
    if (isInfiniteQueryData(queryData)) {
      for (const page of (queryData as InfiniteEntityQueryData).pages) {
        const item = page.items.find((i) => i.id === entityId) as StxEntity | undefined;
        if (item) patchInPlace(item);
      }
    } else if (isQueryData(queryData)) {
      const item = (queryData as EntityQueryData).items.find((i) => i.id === entityId) as StxEntity | undefined;
      if (item) patchInPlace(item);
    }
  }
}

/** Store cache token for entity (live notifications only) */
export function storeEntityCacheToken(entityType: string, entityId: string, token: string): void {
  storeCacheToken(entityType, entityId, token);
}

/** Remove entity from detail cache and remove cache token */
function removeEntityFromCache(entityType: string, entityId: string): void {
  if (hasEntityQueryKeys(entityType)) {
    const keys = getEntityQueryKeys(entityType);
    queryClient.removeQueries({ queryKey: keys.detail.byId(entityId) });
  }
  removeCacheToken(entityType, entityId);
}

/** Remove entity from detail cache, list caches, and token store. */
export function removeEntity(entityType: string, entityId: string, organizationId?: string): void {
  removeEntityFromCache(entityType, entityId);
  if (hasEntityQueryKeys(entityType)) {
    const keys = getEntityQueryKeys(entityType);
    removeEntityFromListCache(entityId, keys, organizationId);
  }
}

/** Invalidate entity detail query */
export function invalidateEntityDetail(
  entityId: string,
  keys: EntityQueryKeys,
  refetchType: 'active' | 'none' = 'active',
): void {
  queryClient.invalidateQueries({ queryKey: keys.detail.byId(entityId), refetchType });
}

/** Invalidate entity list queries */
export function invalidateEntityList(keys: EntityQueryKeys, refetchType: 'active' | 'none' | 'all' = 'active'): void {
  queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType });
}

/**
 * Invalidate entity list queries scoped to a specific organization.
 * Uses the org tier in the key hierarchy for direct prefix matching.
 */
export function invalidateEntityListForOrg(
  keys: EntityQueryKeys,
  organizationId: string,
  refetchType: 'active' | 'none' | 'all' = 'active',
): void {
  queryClient.invalidateQueries({
    queryKey: keys.list.org(organizationId),
    refetchType,
  });
}

/** Remove a single entity from all list caches by ID (no refetch triggered).
 * When organizationId is provided, only scans list caches for that org.
 */
export function removeEntityFromListCache(entityId: string, keys: EntityQueryKeys, organizationId?: string): void {
  const listPrefix = organizationId ? keys.list.org(organizationId) : keys.list.base;
  for (const [queryKey, queryData] of queryClient.getQueriesData({ queryKey: listPrefix })) {
    if (isInfiniteQueryData(queryData)) {
      changeInfiniteQueryData(queryKey, [{ id: entityId }], 'remove');
    } else if (isQueryData(queryData)) {
      changeQueryData(queryKey, [{ id: entityId }], 'remove');
    }
  }
}

/**
 * Fetch a single entity by ID and update both detail and list caches.
 * Uses query defaults (registered by entity modules via queryClient.setQueryDefaults)
 * to resolve the queryFn, so no entity-specific imports are needed here.
 * Falls back to list invalidation if no query defaults are registered.
 *
 * @param organizationId - Optional org ID from SSE notification, passed via meta
 *   so entity-specific queryFn can resolve path params (e.g., task needs organizationId + tenantId).
 * @param tenantId - Optional tenant ID from SSE notification, passed via meta.
 */
export async function fetchEntityAndUpdateList(
  entityId: string,
  keys: EntityQueryKeys,
  action: 'create' | 'update',
  organizationId?: string,
  tenantId?: string,
  entityType?: string,
): Promise<void> {
  // Skip remote writes for entities with pending mutations to preserve optimistic state.
  // The mutation's onSuccess will reconcile the cache when it settles.
  if (entityType && hasPendingMutationForEntity(entityType, entityId)) {
    console.debug(`[CacheOps] Skipping remote ${action} for ${entityType}:${entityId} — has pending mutation`);
    return;
  }

  try {
    const entity = await queryClient.fetchQuery<ItemData>({
      queryKey: keys.detail.byId(entityId),
      staleTime: 0, // Always fetch fresh on SSE notification
      meta: organizationId ? { organizationId, tenantId } : undefined,
    });
    if (entity) {
      // If a Yjs editor is active for this entity, strip Yjs-owned fields to avoid
      // overwriting the local Y.Doc state with a slightly stale server snapshot
      let filtered = entity;
      if (entityType) {
        const yjsStore = useYjsEditorStore.getState();
        if (yjsStore.isActive(entityType as ProductEntityType, entityId)) {
          const ownedFields = yjsStore.getOwnedFields(entityType as ProductEntityType);
          const existing = queryClient.getQueryData<ItemData>(keys.detail.byId(entityId));
          if (existing) {
            filtered = { ...entity };
            // Dynamic field copy — ItemData lacks an index signature, so cast once here
            const target: Record<string, unknown> = filtered as never;
            const source: Record<string, unknown> = existing as never;
            for (const field of ownedFields) {
              if (field in source) target[field] = source[field];
            }
          }
        }
      }

      // Update detail cache
      queryClient.setQueryData(keys.detail.byId(entityId), (old: ItemData | undefined) => {
        if (!old) return filtered;
        return { ...old, ...filtered };
      });

      for (const [queryKey, queryData] of queryClient.getQueriesData({
        queryKey: organizationId ? keys.list.org(organizationId) : keys.list.base,
      })) {
        if (isInfiniteQueryData(queryData)) {
          changeInfiniteQueryData(queryKey, [filtered], action);
        } else if (isQueryData(queryData)) {
          changeQueryData(queryKey, [filtered], action);
        }
      }
    }
  } catch {
    // No query defaults registered for this entity type — fall back to list invalidation
    invalidateEntityList(keys, 'all');
  }
}

/**
 * Fetch changed entities by seq range and patch them into list + detail caches.
 * Uses the registered deltaFetch function to call the list endpoint with `seqCursor`.
 * Returns true if fetch succeeded, false if not available (caller should fall back to full invalidation).
 *
 * seqCursor formats:
 * - "51" — open-ended (seq >= 51), used by catchup
 * - "51,150" — bounded range, used by batch notifications
 *
 * When cacheToken is provided (batch notifications), it's passed through to the API call
 * as X-Cache-Token header, enabling entity cache fan-out on the backend.
 */
export async function fetchRangeAndPatch(
  entityType: string,
  organizationId: string | null,
  tenantId: string | null,
  seqCursor: string,
  keys: EntityQueryKeys,
  cacheToken?: string,
): Promise<boolean> {
  const deltaFetch = getEntityDeltaFetch(entityType);
  if (!deltaFetch) return false;

  try {
    const { items } = await deltaFetch(organizationId, tenantId, seqCursor, cacheToken ? { cacheToken } : undefined);
    if (items.length === 0) return true;

    // Upsert each entity into list caches and detail cache
    for (const entity of items) {
      // Skip entities with pending mutations to preserve optimistic state
      if (hasPendingMutationForEntity(entityType, entity.id)) {
        console.debug(`[CacheOps] Delta fetch: skipping ${entityType}:${entity.id} — has pending mutation`);
        continue;
      }

      // Update detail cache
      queryClient.setQueryData(keys.detail.byId(entity.id), (old: ItemData | undefined) => {
        if (!old) return entity;
        return { ...old, ...entity };
      });

      // Upsert into matching list caches (scoped to org when available)
      const listPrefix = organizationId ? keys.list.org(organizationId) : keys.list.base;
      for (const [queryKey, queryData] of queryClient.getQueriesData({ queryKey: listPrefix })) {
        if (isInfiniteQueryData(queryData)) {
          changeInfiniteQueryData(queryKey, [entity], 'update');
        } else if (isQueryData(queryData)) {
          changeQueryData(queryKey, [entity], 'update');
        }
      }
    }

    console.debug(`[CacheOps] Delta fetch: ${entityType} patched ${items.length} entities (seqCursor=${seqCursor})`);
    return true;
  } catch (error) {
    console.warn(`[CacheOps] Delta fetch failed for ${entityType}, falling back to invalidation`, error);
    return false;
  }
}
