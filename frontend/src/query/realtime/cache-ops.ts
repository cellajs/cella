import type { ProductEntityType } from 'shared';
import { asRecord } from 'shared/utils/as-record';
import { getYjsOwnedFields } from '~/modules/common/blocknote/yjs-editor';
import { resolveHomeChannelId, spliceEntityIntoListCaches } from '~/query/basic/apply-entity-to-lists';
import { cacheRemove } from '~/query/basic/cache-mutations';
import {
  type EntityQueryKeys,
  getEntityDeltaFetch,
  getEntityQueryKeys,
  getEqualityFilterKeys,
  hasEntityQueryKeys,
  SYNC_CHUNK_SIZE,
} from '~/query/basic/entity-query-registry';
import { findInCache } from '~/query/basic/find-in-list-cache';
import { forEachListQuery, getQueryItems } from '~/query/basic/mutate-query';
import type { ItemData, RoutableItemData } from '~/query/basic/types';
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

/** The stamp a Yjs-owned field is compared by: its own, else the description's, which derived columns follow. */
function yjsFieldStamp(row: ItemData, field: string): string | undefined {
  const { stx } = asRecord(row) as { stx?: { fieldTimestamps?: Record<string, string> } };
  return stx?.fieldTimestamps?.[field] ?? stx?.fieldTimestamps?.description;
}

/** Whether a row carries sync metadata: in one that does, a field without a stamp was not written since the create. */
function hasStx(row: ItemData): boolean {
  const { stx } = asRecord(row);
  return typeof stx === 'object' && stx !== null;
}

/**
 * The cache takes a Yjs-owned field only from a server write of it, which stamps the field anew. An incoming row that carries
 * the cached copy's stamp keeps the cached value, so a read that lags the relay cannot overwrite a collaborative patch. A
 * create stamps no field, so two rows that both carry `stx` and neither stamp count as unwritten too; a row without `stx`
 * applies. A server-side backfill of an owned field that stamps nothing reaches a client through a `clientCacheVersion` bump.
 */
function guardYjsOwnedFields<T extends ItemData>(entityType: string, incoming: T, cached: ItemData | undefined): T {
  if (!cached) return incoming;
  const guarded = { ...incoming };
  const bothCarryStx = hasStx(incoming) && hasStx(cached);
  // SSE payloads carry entityType as a runtime string; an unregistered type gets the default fields.
  for (const field of getYjsOwnedFields(entityType as ProductEntityType)) {
    const stamp = yjsFieldStamp(incoming, field);
    const unwritten = stamp === yjsFieldStamp(cached, field) && (stamp !== undefined || bothCarryStx);
    if (unwritten && field in cached) asRecord(guarded)[field] = asRecord(cached)[field];
  }
  return guarded;
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
  forEachListQuery<StxEntity>(listPrefix, (_, data) => {
    for (const item of getQueryItems(data)) if (item.id === entityId) patchInPlace(item);
  });
}

function removeEntityFromCache(entityType: string, entityId: string): void {
  if (hasEntityQueryKeys(entityType)) {
    const keys = getEntityQueryKeys(entityType);
    queryClient.removeQueries({ queryKey: keys.detail.byId(entityId) });
  }
}

/** Removes one entity from detail and list caches without triggering a refetch; an organizationId narrows the list scan to that org. */
export function removeEntity(entityType: string, entityId: string, organizationId?: string): void {
  removeEntityFromCache(entityType, entityId);
  if (hasEntityQueryKeys(entityType)) {
    const keys = getEntityQueryKeys(entityType);
    cacheRemove(organizationId ? keys.list.org(organizationId) : keys.list.base, [{ id: entityId }]);
  }
}

export function invalidateEntityDetail(entityId: string, keys: EntityQueryKeys, refetchType: 'active' | 'none' = 'active'): void {
  queryClient.invalidateQueries({ queryKey: keys.detail.byId(entityId), refetchType });
}

export function invalidateEntityList(keys: EntityQueryKeys, refetchType: 'active' | 'none' | 'all' = 'active'): void {
  queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType });
}

/** Matches on the org tier of the key hierarchy as a direct prefix. */
export function invalidateEntityListForOrg(keys: EntityQueryKeys, organizationId: string, refetchType: 'active' | 'none' | 'all' = 'active'): void {
  queryClient.invalidateQueries({ queryKey: keys.list.org(organizationId), refetchType });
}

const isScalar = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

/**
 * True when the list sets a declared equality key to a value the row's own differs from. The server combines filters
 * with AND, so that one key excludes the row whatever `q` or the other filters say; a row without the field never
 * counts as excluded.
 */
function filtersExcludeRow(filters: object[], row: Record<string, unknown>, equalityKeys: readonly string[]): boolean {
  return filters
    .flatMap((filter) => Object.entries(filter))
    .some(([key, value]) => {
      if (!equalityKeys.includes(key) || !isScalar(value) || value === '') return false;
      const rowValue = row[key];
      if (rowValue === null) return true;
      return isScalar(rowValue) && String(rowValue) !== String(value);
    });
}

/**
 * Invalidates org-scoped lists whose key tail holds a filter object; canonical home lists have string-only tails and are patched directly.
 * A list whose declared equality filters exclude every new row keeps its data, see `registerEqualityFilterKeys`.
 */
function invalidateFilteredLists(entityType: string, orgListKey: readonly unknown[], newRows: ItemData[]): void {
  const equalityKeys = getEqualityFilterKeys(entityType);
  queryClient.invalidateQueries({
    queryKey: orgListKey,
    predicate: (q) => {
      const filters = q.queryKey.slice(2).filter((seg): seg is object => typeof seg === 'object' && seg !== null);
      if (!filters.length) return false;
      if (!equalityKeys || !newRows.length) return true;
      return !newRows.every((row) => filtersExcludeRow(filters, asRecord(row), equalityKeys));
    },
  });
}

/**
 * Applies server truth to detail and list caches: tombstones remove, new rows enter only home lists. Each cached list row
 * guards its Yjs-owned fields against itself; the detail and rows new to a list guard against `reference`.
 * Returns true when every list lacked the row, so the caller can invalidate opaque filtered lists once.
 */
function applyServerEntity(
  entityType: string,
  entity: ItemData,
  keys: EntityQueryKeys,
  organizationId: string | null,
  reference: ItemData | undefined,
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

  const routedEntity: RoutableItemData = { ...entity, entityType, organizationId: organizationId ?? undefined };
  const guarded = guardYjsOwnedFields(entityType, entity, reference);

  queryClient.setQueryData(keys.detail.byId(entity.id), (old: ItemData | undefined) => {
    if (!old) return guarded;
    return { ...old, ...guarded };
  });

  const homeChannelId = resolveHomeChannelId(entityType, routedEntity);

  // Shared canonical-home policy: cached rows update in place, new rows insert only into the canonical home list, a row whose parent channel changed is removed.
  const { seen, spliced, sawFilteredList } = spliceEntityIntoListCaches(queryClient, routedEntity, {
    removeOnParentChannelChange: true,
    rowFor: (cachedItem) => guardYjsOwnedFields(entityType, routedEntity, cachedItem ?? reference),
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

  // Read before the fetch, which writes the detail: the cached row is the only record of which embedded rows this host referenced.
  const cached = entityType ? findInCache<ItemData>(entityType, entityId) : undefined;

  try {
    const entity = await queryClient.query<ItemData>({
      queryKey: keys.detail.byId(entityId),
      staleTime: 0, // Always fetch fresh on SSE notification
      meta: organizationId ? { organizationId, tenantId } : undefined,
    });
    if (!entity) return;

    const touches: EmbeddingTouches = new Map();
    if (entityType) collectEmbeddingTouches(entityType, cached, entity, touches);

    // The fetch replaced the detail, so its guard compares against a list copy, which a patch made meanwhile also reached, else the row read before.
    const listCopy = entityType ? findInCache<ItemData>(entityType, (item) => item.id === entityId) : undefined;
    applyServerEntity(entityType ?? '', entity, keys, organizationId ?? null, listCopy ?? cached);
    if (organizationId) invalidateEmbeddedUsage(touches, organizationId);
    // The notification says create: active filtered lists refetch to place the new row.
    if (action === 'create' && organizationId) {
      invalidateFilteredLists(entityType ?? '', keys.list.org(organizationId), [entity]);
    }
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

    const newRows: ItemData[] = [];
    const embeddingTouches: EmbeddingTouches = new Map();
    for (const entity of items) {
      // Read before applying: the cached row is the only record of which embedded rows this host referenced.
      const cached = findInCache<ItemData>(entityType, entity.id);
      collectEmbeddingTouches(entityType, cached, entity, embeddingTouches);
      if (applyServerEntity(entityType, entity, keys, organizationId, cached)) newRows.push(entity);
    }

    // Filtered lists filter on the server, so one invalidation per flush lets the active ones refetch and place new rows.
    if (newRows.length && organizationId) invalidateFilteredLists(entityType, keys.list.org(organizationId), newRows);

    if (items.length > 0) {
      console.debug(`[CacheOps] Delta fetch: ${entityType} patched ${items.length} entities (seqCursor=${seqCursor})`);
    }
    const reachedSeq = items.reduce((max, item) => Math.max(max, seqOf(item)), 0);
    return { status: 'ok', items, reachedSeq, embeddingTouches };
  } catch (error) {
    console.warn(`[CacheOps] Delta fetch failed for ${entityType}, falling back to invalidation`, error);
    return { status: 'error', items: [], reachedSeq: 0, embeddingTouches: new Map() };
  }
}
