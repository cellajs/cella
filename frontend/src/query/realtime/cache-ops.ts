import type { QueryKey } from '@tanstack/react-query';
import type { ProductEntityType } from 'shared';
import { getYjsOwnedFields, isYjsEditorActive } from '~/modules/common/blocknote/yjs-editor';
import { resolveHomeChannelId, spliceEntityIntoListCaches } from '~/query/basic/apply-entity-to-lists';
import {
  type EntityQueryKeys,
  getEntityDeltaFetch,
  getEntityQueryKeys,
  hasEntityQueryKeys,
  SYNC_CHUNK_SIZE,
} from '~/query/basic/entity-query-registry';
import { changeInfiniteQueryData, changeQueryData } from '~/query/basic/helpers';
import { isInfiniteQueryData, isQueryData } from '~/query/basic/mutate-query';
import type { EntityQueryData, InfiniteEntityQueryData, ItemData, RoutableItemData } from '~/query/basic/types';
import { isPending } from '~/query/offline/mutation-queue';
import { queryClient } from '~/query/query-client';

/**
 * True if an entity has a pending (in-flight or paused) mutation. When true, skip remote cache
 * writes to preserve optimistic state. The mutation's own onSuccess reconciles the cache on settle.
 */
export function hasPendingMutationForEntity(entityType: string, entityId: string): boolean {
  const mutationCache = queryClient.getMutationCache();
  for (const suffix of ['update', 'create', 'delete'] as const) {
    const mutations = mutationCache.findAll({ mutationKey: [entityType, suffix] });
    for (const mutation of mutations) {
      if (!isPending(mutation)) continue;
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

function isSoftDeleted(entity: ItemData): boolean {
  const deletedAt = (entity as unknown as Record<string, unknown>).deletedAt;
  return typeof deletedAt === 'string' && deletedAt.length > 0;
}

/**
 * If a Yjs editor is active for this entity, replace Yjs-owned fields on the incoming
 * server snapshot with the locally cached values, so a slightly stale server read can't
 * overwrite the local Y.Doc-derived state. Returns the entity unchanged otherwise.
 */
function stripYjsOwnedFields(entityType: string, entity: ItemData, detailKey: QueryKey): ItemData {
  // SSE payloads carry entityType as a runtime string; isActive misses are harmless
  const type = entityType as ProductEntityType;
  if (!isYjsEditorActive(type, entity.id)) return entity;

  const existing = queryClient.getQueryData<ItemData>(detailKey);
  if (!existing) return entity;

  const filtered = { ...entity };
  // Dynamic field copy, ItemData lacks an index signature, so cast once here
  const target: Record<string, unknown> = filtered as never;
  const source: Record<string, unknown> = existing as never;
  for (const field of getYjsOwnedFields(type)) {
    if (field in source) target[field] = source[field];
  }
  return filtered;
}

/**
 * Patch only cached STX metadata for echo-prevented stream events, preserving optimistic fields.
 * Mutate unrendered metadata in place to avoid React Query observer notifications.
 */
export function patchEntityStxInCache(
  entityType: ProductEntityType,
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

/** Remove entity from detail cache */
function removeEntityFromCache(entityType: string, entityId: string): void {
  if (hasEntityQueryKeys(entityType)) {
    const keys = getEntityQueryKeys(entityType);
    queryClient.removeQueries({ queryKey: keys.detail.byId(entityId) });
  }
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

/**
 * Invalidate org-scoped lists whose key tail contains a filter object (i.e. filtered lists).
 * Canonical home lists (string-only tails) are left alone, they're patched directly.
 */
function invalidateFilteredLists(orgListKey: readonly unknown[]): void {
  queryClient.invalidateQueries({
    queryKey: orgListKey,
    predicate: (q) => q.queryKey.slice(2).some((seg) => typeof seg === 'object' && seg !== null),
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
 * Apply server truth across detail and list caches; tombstones remove and new rows enter only home lists.
 * Return whether every list lacked the row so callers can invalidate opaque filtered lists once.
 */
function applyServerEntity(
  entityType: string,
  entity: ItemData,
  keys: EntityQueryKeys,
  organizationId: string | null,
): boolean {
  if (isSoftDeleted(entity)) {
    removeEntity(entityType, entity.id, organizationId ?? undefined);
    return false;
  }

  // Skip remote writes for entities with pending mutations to preserve optimistic state.
  // The mutation's onSuccess will reconcile the cache when it settles.
  if (hasPendingMutationForEntity(entityType, entity.id)) {
    console.debug(`[CacheOps] Skipping remote apply for ${entityType}:${entity.id}, has pending mutation`);
    return false;
  }

  const filtered = stripYjsOwnedFields(entityType, entity, keys.detail.byId(entity.id));
  const routedEntity: RoutableItemData = {
    ...filtered,
    entityType,
    organizationId: organizationId ?? undefined,
  };

  // Update detail cache
  queryClient.setQueryData(keys.detail.byId(entity.id), (old: ItemData | undefined) => {
    if (!old) return filtered;
    return { ...old, ...filtered };
  });

  const homeChannelId = resolveHomeChannelId(entityType, routedEntity);

  // Splice into list caches through the shared canonical-home policy (also used by the mutation
  // path). Cached rows update in place; new rows insert only into the canonical home list; a row
  // whose parent channel changed is removed.
  const { seen, spliced, sawFilteredList } = spliceEntityIntoListCaches(queryClient, routedEntity, {
    removeOnParentChannelChange: true,
  });

  // A new row that no home list spliced and no filtered list will refetch stays invisible until
  // an unrelated refetch. This is always a key-shape bug (canonical data cached outside keys.list.home).
  if (organizationId && homeChannelId && !seen && !spliced && !sawFilteredList) {
    console.warn(
      `[CacheOps] New ${entityType} row ${entity.id} landed in no list cache — ` +
        `no canonical home list ${JSON.stringify(keys.list.home(organizationId, homeChannelId))} and no filtered list to invalidate.`,
    );
  }

  return !seen;
}

/**
 * Fetch one entity through registered query defaults and apply it to caches, or invalidate lists.
 * Stream organization and tenant IDs pass through metadata for path resolution.
 */
export async function fetchEntityAndUpdateList(
  entityId: string,
  keys: EntityQueryKeys,
  action: 'create' | 'update',
  organizationId?: string,
  tenantId?: string,
  entityType?: ProductEntityType,
): Promise<void> {
  // Don't even fetch for entities with pending mutations; applyServerEntity re-checks on apply.
  if (entityType && hasPendingMutationForEntity(entityType, entityId)) {
    console.debug(`[CacheOps] Skipping remote ${action} for ${entityType}:${entityId}, has pending mutation`);
    return;
  }

  try {
    const entity = await queryClient.fetchQuery<ItemData>({
      queryKey: keys.detail.byId(entityId),
      staleTime: 0, // Always fetch fresh on SSE notification
      meta: organizationId ? { organizationId, tenantId } : undefined,
    });
    if (!entity) return;

    applyServerEntity(entityType ?? '', entity, keys, organizationId ?? null);
    // The notification says create: active filtered lists refetch to place the new row.
    if (action === 'create' && organizationId) invalidateFilteredLists(keys.list.org(organizationId));
  } catch {
    // No query defaults registered for this entity type, fall back to list invalidation
    invalidateEntityList(keys, 'all');
  }
}

/**
 * Describes a bounded sequence fetch applied to list and detail caches.
 * Only `ok` permits cursor advancement; overflow/unsupported require list invalidation, while
 * transient errors may retry. `reachedSeq` exposes short deliveries.
 */
export interface RangeFetchResult {
  status: 'ok' | 'overflow' | 'unsupported' | 'error';
  items: ItemData[];
  /** Highest seq actually returned; 0 when empty. Lets callers detect a short delivery. */
  reachedSeq: number;
}

// Product rows carry the org sequence; read it defensively (ItemData is intentionally loose).
const seqOf = (item: ItemData): number => {
  const seq = (item as { seq?: unknown }).seq;
  return typeof seq === 'number' ? seq : 0;
};

export async function fetchRangeAndPatch(
  entityType: string,
  organizationId: string | null,
  tenantId: string | null,
  seqCursor: string,
  keys: EntityQueryKeys,
  channelId?: string,
): Promise<RangeFetchResult> {
  if (!tenantId && organizationId) {
    console.debug(`[CacheOps] No tenantId for ${entityType} delta fetch, falling back to invalidation`);
    return { status: 'unsupported', items: [], reachedSeq: 0 };
  }

  const deltaFetch = getEntityDeltaFetch(entityType);
  if (!deltaFetch) return { status: 'unsupported', items: [], reachedSeq: 0 };

  try {
    const { items } = await deltaFetch(organizationId, tenantId, seqCursor, channelId);

    // A full chunk may truncate the range. Report overflow so the caller invalidates without
    // advancing past unseen rows.
    if (items.length >= SYNC_CHUNK_SIZE) {
      console.debug(`[CacheOps] Delta fetch: ${entityType} window overflow (seqCursor=${seqCursor}) → invalidation`);
      return { status: 'overflow', items: [], reachedSeq: 0 };
    }

    let sawNewRow = false;
    for (const entity of items) {
      sawNewRow = applyServerEntity(entityType, entity, keys, organizationId) || sawNewRow;
    }

    // Rows new to every list cache cannot be spliced into filtered lists with unknown server-side
    // filters. One invalidation per flush lets active filtered lists refetch and place them.
    if (sawNewRow && organizationId) invalidateFilteredLists(keys.list.org(organizationId));

    if (items.length > 0) {
      console.debug(`[CacheOps] Delta fetch: ${entityType} patched ${items.length} entities (seqCursor=${seqCursor})`);
    }
    return { status: 'ok', items, reachedSeq: items.reduce((max, item) => Math.max(max, seqOf(item)), 0) };
  } catch (error) {
    console.warn(`[CacheOps] Delta fetch failed for ${entityType}, falling back to invalidation`, error);
    return { status: 'error', items: [], reachedSeq: 0 };
  }
}
