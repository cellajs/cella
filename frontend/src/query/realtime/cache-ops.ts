import type { QueryKey } from '@tanstack/react-query';
import type { ProductEntityType } from 'shared';
import { asRecord } from 'shared/utils/as-record';
import { getYjsOwnedFields, isYjsEditorActive } from '~/modules/common/blocknote/yjs-editor';
import { resolveHomeChannelId, spliceEntityIntoListCaches } from '~/query/basic/apply-entity-to-lists';
import {
  type EntityQueryKeys,
  getEntityDeltaFetch,
  getEntityQueryKeys,
  hasEntityQueryKeys,
  SYNC_CHUNK_SIZE,
} from '~/query/basic/entity-query-registry';
import { findInCache } from '~/query/basic/find-in-list-cache';
import { changeInfiniteQueryData, changeQueryData } from '~/query/basic/helpers';
import { isInfiniteQueryData, isQueryData } from '~/query/basic/mutate-query';
import type { EntityQueryData, InfiniteEntityQueryData, ItemData, RoutableItemData } from '~/query/basic/types';
import { isPending } from '~/query/offline/mutation-queue';
import { queryClient } from '~/query/query-client';
import { collectEmbeddingTouches, type EmbeddingTouches, invalidateEmbeddedUsage } from './propagation';

/** Callers skip remote cache writes while this is true, so optimistic state survives; the mutation's onSuccess reconciles on settle. */
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
  const deletedAt = asRecord(entity).deletedAt;
  return typeof deletedAt === 'string' && deletedAt.length > 0;
}

/** While a Yjs editor is active, restores Yjs-owned fields from cache so a stale server read cannot overwrite local Y.Doc state. */
function stripYjsOwnedFields(entityType: string, entity: ItemData, detailKey: QueryKey): ItemData {
  // SSE payloads carry entityType as a runtime string; isActive misses are harmless.
  const type = entityType as ProductEntityType;
  if (!isYjsEditorActive(type, entity.id)) return entity;

  const existing = queryClient.getQueryData<ItemData>(detailKey);
  if (!existing) return entity;

  const filtered = { ...entity };
  // ItemData has no index signature, so cast once for the dynamic field copy.
  const target: Record<string, unknown> = filtered as never;
  const source: Record<string, unknown> = existing as never;
  for (const field of getYjsOwnedFields(type)) {
    if (field in source) target[field] = source[field];
  }
  return filtered;
}

/** Patches only cached STX metadata for echo-prevented stream events, in place so no React Query observer is notified and optimistic fields survive. */
export function patchEntityStxInCache(
  entityType: ProductEntityType,
  entityId: string,
  stx: { fieldTimestamps?: Record<string, string> },
  organizationId?: string,
): void {
  if (!hasEntityQueryKeys(entityType)) return;

  const keys = getEntityQueryKeys(entityType);

  type StxEntity = { id: string; stx?: Record<string, unknown> };

  const patchInPlace = (item: StxEntity): void => {
    if (!item.stx) return;
    item.stx.fieldTimestamps = stx.fieldTimestamps;
  };

  const detail = queryClient.getQueryData<StxEntity>(keys.detail.byId(entityId));
  if (detail?.stx) patchInPlace(detail);

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

function removeEntityFromCache(entityType: string, entityId: string): void {
  if (hasEntityQueryKeys(entityType)) {
    const keys = getEntityQueryKeys(entityType);
    queryClient.removeQueries({ queryKey: keys.detail.byId(entityId) });
  }
}

export function removeEntity(entityType: string, entityId: string, organizationId?: string): void {
  removeEntityFromCache(entityType, entityId);
  if (hasEntityQueryKeys(entityType)) {
    const keys = getEntityQueryKeys(entityType);
    removeEntityFromListCache(entityId, keys, organizationId);
  }
}

export function invalidateEntityDetail(
  entityId: string,
  keys: EntityQueryKeys,
  refetchType: 'active' | 'none' = 'active',
): void {
  queryClient.invalidateQueries({ queryKey: keys.detail.byId(entityId), refetchType });
}

export function invalidateEntityList(keys: EntityQueryKeys, refetchType: 'active' | 'none' | 'all' = 'active'): void {
  queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType });
}

/** Matches on the org tier of the key hierarchy as a direct prefix. */
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

/** Invalidates org-scoped lists whose key tail holds a filter object; canonical home lists have string-only tails and are patched directly. */
function invalidateFilteredLists(orgListKey: readonly unknown[]): void {
  queryClient.invalidateQueries({
    queryKey: orgListKey,
    predicate: (q) => q.queryKey.slice(2).some((seg) => typeof seg === 'object' && seg !== null),
  });
}

/** Removes one entity from list caches without triggering a refetch; an organizationId narrows the scan to that org. */
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
 * Applies server truth to detail and list caches: tombstones remove, new rows enter only home lists.
 * Returns true when every list lacked the row, so the caller can invalidate opaque filtered lists once.
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

  // Preserve optimistic state; the mutation's onSuccess reconciles the cache when it settles.
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

  queryClient.setQueryData(keys.detail.byId(entity.id), (old: ItemData | undefined) => {
    if (!old) return filtered;
    return { ...old, ...filtered };
  });

  const homeChannelId = resolveHomeChannelId(entityType, routedEntity);

  // Shared canonical-home policy: cached rows update in place, new rows insert only into the canonical home list, a row whose parent channel changed is removed.
  const { seen, spliced, sawFilteredList } = spliceEntityIntoListCaches(queryClient, routedEntity, {
    removeOnParentChannelChange: true,
  });

  // A new row no home list spliced and no filtered list refetches stays invisible: a key-shape bug, canonical data cached outside keys.list.home.
  if (organizationId && homeChannelId && !seen && !spliced && !sawFilteredList) {
    console.warn(
      `[CacheOps] New ${entityType} row ${entity.id} landed in no list cache: ` +
        `no canonical home list ${JSON.stringify(keys.list.home(organizationId, homeChannelId))} and no filtered list to invalidate.`,
    );
  }

  return !seen;
}

/** Fetches one entity through registered query defaults and applies it to caches, falling back to list invalidation. Stream org and tenant IDs pass through meta for path resolution. */
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

    // Read before applying: the cached row is the only record of which embedded rows this host referenced.
    const touches: EmbeddingTouches = new Map();
    if (entityType) collectEmbeddingTouches(entityType, findInCache<ItemData>(entityType, entityId), entity, touches);

    applyServerEntity(entityType ?? '', entity, keys, organizationId ?? null);
    if (organizationId) invalidateEmbeddedUsage(touches, organizationId);
    // The notification says create: active filtered lists refetch to place the new row.
    if (action === 'create' && organizationId) invalidateFilteredLists(keys.list.org(organizationId));
  } catch {
    // No query defaults registered for this entity type, fall back to list invalidation
    invalidateEntityList(keys, 'all');
  }
}

/** Only `ok` permits cursor advancement; `overflow` and `unsupported` require list invalidation, `error` may retry. */
export interface RangeFetchResult {
  status: 'ok' | 'overflow' | 'unsupported' | 'error';
  items: ItemData[];
  /** Highest seq actually returned; 0 when empty. Lets callers detect a short delivery. */
  reachedSeq: number;
  /** Embedded rows whose usage aggregates the fetched host rows made stale; empty unless status is `ok`. */
  embeddingTouches: EmbeddingTouches;
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
    return { status: 'unsupported', items: [], reachedSeq: 0, embeddingTouches: new Map() };
  }

  const deltaFetch = getEntityDeltaFetch(entityType);
  if (!deltaFetch) return { status: 'unsupported', items: [], reachedSeq: 0, embeddingTouches: new Map() };

  try {
    const { items } = await deltaFetch(organizationId, tenantId, seqCursor, channelId);

    // A full chunk may truncate the range: report overflow so the caller invalidates without advancing past unseen rows.
    if (items.length >= SYNC_CHUNK_SIZE) {
      console.debug(`[CacheOps] Delta fetch: ${entityType} window overflow (seqCursor=${seqCursor}) → invalidation`);
      return { status: 'overflow', items: [], reachedSeq: 0, embeddingTouches: new Map() };
    }

    let sawNewRow = false;
    const embeddingTouches: EmbeddingTouches = new Map();
    for (const entity of items) {
      // Read before applying: the cached row is the only record of which embedded rows this host referenced.
      collectEmbeddingTouches(entityType, findInCache<ItemData>(entityType, entity.id), entity, embeddingTouches);
      sawNewRow = applyServerEntity(entityType, entity, keys, organizationId) || sawNewRow;
    }

    // Filtered lists have unknown server-side filters, so one invalidation per flush lets the active ones refetch and place new rows.
    if (sawNewRow && organizationId) invalidateFilteredLists(keys.list.org(organizationId));

    if (items.length > 0) {
      console.debug(`[CacheOps] Delta fetch: ${entityType} patched ${items.length} entities (seqCursor=${seqCursor})`);
    }
    return {
      status: 'ok',
      items,
      reachedSeq: items.reduce((max, item) => Math.max(max, seqOf(item)), 0),
      embeddingTouches,
    };
  } catch (error) {
    console.warn(`[CacheOps] Delta fetch failed for ${entityType}, falling back to invalidation`, error);
    return { status: 'error', items: [], reachedSeq: 0, embeddingTouches: new Map() };
  }
}
