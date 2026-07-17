import type { QueryKey } from '@tanstack/react-query';
import type { ProductEntityType } from 'shared';
import { appConfig, hierarchy, resolveDeepestAncestorId } from 'shared';
import { getYjsOwnedFields, isYjsEditorActive } from '~/modules/common/blocknote/yjs-editor';
import {
  type EntityQueryKeys,
  getEntityDeltaFetch,
  getEntityQueryKeys,
  hasEntityQueryKeys,
  SYNC_CHUNK_SIZE,
} from '~/query/basic/entity-query-registry';
import { changeInfiniteQueryData, changeQueryData } from '~/query/basic/helpers';
import { isInfiniteQueryData, isQueryData } from '~/query/basic/mutate-query';
import type { EntityQueryData, InfiniteEntityQueryData, ItemData } from '~/query/basic/types';
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
 * Check if an entity was moved to a different parent context (e.g. different project/workspace).
 * Returns true when any context ID column differs between cached and incoming versions.
 */
function hasParentChannelChanged(cached: ItemData, incoming: ItemData): boolean {
  const c = cached as unknown as Record<string, unknown>;
  const i = incoming as unknown as Record<string, unknown>;
  for (const entityType of appConfig.channelEntityTypes) {
    const key = appConfig.entityIdColumnKeys[entityType];
    if (typeof c[key] === 'string' && typeof i[key] === 'string' && c[key] !== i[key]) return true;
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
 * The row's effective home channel id: deepest non-null ancestor, the org itself for org-homed
 * rows. The same resolution SSE routing uses (resolve-row-channel), so cache placement and
 * stream routing can never disagree.
 */
function resolveHomeChannelId(entityType: string, entity: ItemData): string | null {
  const entityRecord = entity as unknown as Record<string, unknown>;
  const home = resolveDeepestAncestorId(hierarchy, entityType, entityRecord);
  if (home) return home;
  const organizationId = entityRecord.organizationId;
  return typeof organizationId === 'string' ? organizationId : null;
}

/**
 * Whether `queryKey` is the canonical home list for a row homed at `homeChannelId`:
 * [entityType, 'list', organizationId, homeChannelId]. Every row belongs to exactly one home
 * list. Filtered keys (object segments) never match, those lists are scoped by server-side
 * filters we can't replicate here; string keys at other depths are prefixes, never data keys.
 */
function matchesCanonicalHome(queryKey: readonly unknown[], organizationId: string, homeChannelId: string): boolean {
  return queryKey.length === 4 && queryKey[2] === organizationId && queryKey[3] === homeChannelId;
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
 * Apply one server-truth row to detail and list caches through the shared applicator for both
 * realtime paths (seq-range fetches and seq-less single fetches). Tombstones remove; rows
 * already cached update in place; unknown rows insert only into their canonical home list
 * (the row's effective home channel — see matchesCanonicalHome).
 * Returns true when the row was new to every scanned list cache, so callers can invalidate
 * filtered lists with object key segments, whose server-side filters cannot be replicated, once per flush.
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

  // Update detail cache
  queryClient.setQueryData(keys.detail.byId(entity.id), (old: ItemData | undefined) => {
    if (!old) return filtered;
    return { ...old, ...filtered };
  });

  const homeChannelId = resolveHomeChannelId(entityType, filtered);

  let seen = false;
  let spliced = false;
  let sawFilteredList = false;
  const listPrefix = organizationId ? keys.list.org(organizationId) : keys.list.base;
  for (const [queryKey, queryData] of queryClient.getQueriesData({ queryKey: listPrefix })) {
    sawFilteredList ||= queryKey.slice(2).some((seg) => typeof seg === 'object' && seg !== null);

    let cachedItem: ItemData | undefined;
    let change: typeof changeQueryData;
    if (isInfiniteQueryData<ItemData>(queryData)) {
      cachedItem = queryData.pages.flatMap((p) => p.items).find((item) => item.id === entity.id);
      change = changeInfiniteQueryData;
    } else if (isQueryData<ItemData>(queryData)) {
      cachedItem = queryData.items.find((item) => item.id === entity.id);
      change = changeQueryData;
    } else {
      continue;
    }

    // Remove cached items after their parent context changes.
    if (cachedItem && hasParentChannelChanged(cachedItem, filtered)) {
      change(queryKey, [filtered], 'remove');
      continue;
    }

    // Cached rows update in place. New rows insert only into the row's canonical home list;
    // 'update' elsewhere is a deliberate no-op ('create' on a cached row would also drift
    // `total` because updateArrayItems dedupes but the total adjustment does not).
    const isHomeList =
      !!organizationId && !!homeChannelId && matchesCanonicalHome(queryKey, organizationId, homeChannelId);
    seen = seen || !!cachedItem;
    spliced ||= !cachedItem && isHomeList;
    change(queryKey, [filtered], cachedItem || !isHomeList ? 'update' : 'create');
  }

  // A new row that no home list spliced and no filtered list will refetch stays invisible until
  // an unrelated refetch — always a key-shape bug (canonical data cached outside keys.list.home).
  if (organizationId && homeChannelId && !seen && !spliced && !sawFilteredList) {
    console.warn(
      `[CacheOps] New ${entityType} row ${entity.id} landed in no list cache — ` +
        `no canonical home list ${JSON.stringify(keys.list.home(organizationId, homeChannelId))} and no filtered list to invalidate.`,
    );
  }

  return !seen;
}

/**
 * Fetch a single entity by ID and apply it to detail + list caches. Resolves the queryFn from
 * query defaults (registered by entity modules), so no entity-specific imports here; falls back
 * to list invalidation if none are registered. `organizationId`/`tenantId` from the SSE
 * notification are passed via meta so entity queryFns can resolve path params.
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
 * Fetch changed entities by seq range (via the registered deltaFetch: list endpoint + `seqCursor`)
 * and patch them into list + detail caches. Returns true only when the FULL range was ingested (so
 * callers may advance their sync cursor); false when unavailable, failed, or the window overflows
 * one response. Callers then fall back to full list invalidation and react-query owns recovery.
 *
 * seqCursor: "51" (open-ended, catchup) or "51,150" (bounded range, batch notifications).
 *
 * Result statuses drive the caller's recovery policy: 'ok' (patched; `items` are the fetched
 * rows, e.g. for unseen-count accounting), 'overflow'/'unsupported' (fall back to list
 * invalidation now), 'error' (transient and safe to retry).
 */
export interface RangeFetchResult {
  status: 'ok' | 'overflow' | 'unsupported' | 'error';
  items: ItemData[];
}

export async function fetchRangeAndPatch(
  entityType: string,
  organizationId: string | null,
  tenantId: string | null,
  seqCursor: string,
  keys: EntityQueryKeys,
): Promise<RangeFetchResult> {
  if (!tenantId && organizationId) {
    console.debug(`[CacheOps] No tenantId for ${entityType} delta fetch, falling back to invalidation`);
    return { status: 'unsupported', items: [] };
  }

  const deltaFetch = getEntityDeltaFetch(entityType);
  if (!deltaFetch) return { status: 'unsupported', items: [] };

  try {
    const { items } = await deltaFetch(organizationId, tenantId, seqCursor);

    // Overflow guard: registrars request SYNC_CHUNK_SIZE, so a full response means the seq
    // window may exceed what one fetch returns. Patching a truncated window would silently
    // drop the remainder (the backend orders seq reads by seq, but the caller advances its
    // cursor to the window end), treat as "delta too large" and let the caller invalidate.
    if (items.length >= SYNC_CHUNK_SIZE) {
      console.debug(`[CacheOps] Delta fetch: ${entityType} window overflow (seqCursor=${seqCursor}) → invalidation`);
      return { status: 'overflow', items: [] };
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
    return { status: 'ok', items };
  } catch (error) {
    console.warn(`[CacheOps] Delta fetch failed for ${entityType}, falling back to invalidation`, error);
    return { status: 'error', items: [] };
  }
}
