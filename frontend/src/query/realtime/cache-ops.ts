import type { ProductEntityType } from 'shared';
import { asRecord } from 'shared/utils/as-record';
import { getYjsOwnedFields } from '~/modules/common/blocknote/yjs-editor';
import { resolveHomeChannelId, spliceEntityIntoListCaches } from '~/query/basic/apply-entity-to-lists';
import { cacheRemove } from '~/query/basic/cache-mutations';
import {
  type EntityQueryKeys,
  getEntityQueryKeys,
  getEntityRangeFetch,
  getEqualityFilterKeys,
  hasEntityQueryKeys,
  type SeqRange,
  syncChunkSize,
} from '~/query/basic/entity-query-registry';
import { findInCache } from '~/query/basic/find-in-list-cache';
import { forEachListQuery, getQueryItems } from '~/query/basic/mutate-query';
import type { ItemData, RoutableItemData } from '~/query/basic/types';
import { isPending } from '~/query/offline/mutation-queue';
import { entityIdsOf } from '~/query/offline/mutation-variables';
import { queryClient } from '~/query/query-client';

/** Callers skip remote cache writes while this is true, so optimistic state survives; the mutation's onSuccess reconciles on settle. */
function hasPendingMutationForEntity(entityType: string, entityId: string): boolean {
  const mutationCache = queryClient.getMutationCache();
  for (const suffix of ['update', 'create', 'delete'] as const) {
    const mutations = mutationCache.findAll({ mutationKey: [entityType, suffix] });
    for (const mutation of mutations) {
      if (isPending(mutation) && entityIdsOf(mutation.state.variables).includes(entityId)) return true;
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
  organizationId: string,
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

  forEachListQuery<StxEntity>(keys.list.org(organizationId), (_, data) => {
    for (const item of getQueryItems(data)) if (item.id === entityId) patchInPlace(item);
  });
}

/** Removes one entity from detail and list caches without triggering a refetch; an organizationId narrows the list scan to that org. */
export function removeEntity(entityType: string, entityId: string, organizationId?: string): void {
  if (!hasEntityQueryKeys(entityType)) return;
  const keys = getEntityQueryKeys(entityType);
  queryClient.removeQueries({ queryKey: keys.detail.byId(entityId) });
  cacheRemove(organizationId ? keys.list.org(organizationId) : keys.list.base, [{ id: entityId }]);
}

export function invalidateEntityDetail(entityId: string, keys: EntityQueryKeys, refetchType: 'active' | 'none' = 'active'): void {
  queryClient.invalidateQueries({ queryKey: keys.detail.byId(entityId), refetchType });
}

function invalidateEntityList(keys: EntityQueryKeys, refetchType: 'active' | 'none' | 'all' = 'active'): void {
  queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType });
}

/** Marks every cached list and detail of an entity type stale and refetches the ones on screen. */
export function invalidateEntityQueries(keys: EntityQueryKeys): void {
  queryClient.invalidateQueries({ queryKey: keys.list.base, refetchType: 'active' });
  queryClient.invalidateQueries({ queryKey: keys.detail.base, refetchType: 'active' });
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
    predicate: (query) => {
      const filters = query.queryKey.slice(2).filter((segment): segment is object => typeof segment === 'object' && segment !== null);
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
  entityType: ProductEntityType,
  entityId: string,
  keys: EntityQueryKeys,
  action: 'create' | 'update',
  organizationId: string,
  tenantId: string | null,
): Promise<void> {
  // Don't even fetch for entities with pending mutations; applyServerEntity re-checks on apply.
  if (hasPendingMutationForEntity(entityType, entityId)) {
    console.debug(`[CacheOps] Skipping remote ${action} for ${entityType}:${entityId}, has pending mutation`);
    return;
  }

  // Read before the fetch, which writes the detail: without a list copy, the guard compares against the row as it was.
  const cached = findInCache<ItemData>(entityType, entityId);

  try {
    const entity = await queryClient.query<ItemData>({
      queryKey: keys.detail.byId(entityId),
      staleTime: 0, // Always fetch fresh on SSE notification
      meta: { organizationId, tenantId: tenantId ?? undefined },
    });
    if (!entity) return;

    // The fetch replaced the detail, so its guard compares against a list copy, which a patch made meanwhile also reached, else the row read before.
    const listCopy = findInCache<ItemData>(entityType, (item) => item.id === entityId);
    applyServerEntity(entityType, entity, keys, organizationId, listCopy ?? cached);
    // The notification says create: active filtered lists refetch to place the new row.
    if (action === 'create') invalidateFilteredLists(entityType, keys.list.org(organizationId), [entity]);
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
}

const failedRange = (status: Exclude<RangeFetchResult['status'], 'ok'>): RangeFetchResult => ({ status, items: [], reachedSeq: 0 });

// Product rows carry the org sequence; read it defensively (ItemData is intentionally loose).
const seqOf = (item: ItemData): number | undefined => {
  const seq = (item as { seq?: unknown }).seq;
  return typeof seq === 'number' ? seq : undefined;
};

export async function fetchRangeAndPatch(
  entityType: string,
  organizationId: string | null,
  tenantId: string | null,
  range: SeqRange,
  keys: EntityQueryKeys,
  channelId?: string,
): Promise<RangeFetchResult> {
  if (!tenantId && organizationId) {
    console.debug(`[CacheOps] No tenantId for ${entityType} range fetch, falling back to invalidation`);
    return failedRange('unsupported');
  }

  const rangeFetch = getEntityRangeFetch(entityType);
  if (!rangeFetch) return failedRange('unsupported');

  const { afterSeq, untilSeq } = range;
  const label = `${entityType} after ${afterSeq} until ${untilSeq}`;
  try {
    const { items } = await rangeFetch({ organizationId, tenantId, channelId, query: { ...range, limit: syncChunkSize } });

    // A full chunk may truncate the range: report overflow so the caller invalidates without advancing past unseen rows.
    if (items.length >= syncChunkSize) {
      console.debug(`[CacheOps] Range fetch: ${label} overflows one chunk → invalidation`);
      return failedRange('overflow');
    }

    // A server that ignored the range answers with an ordinary page: rows outside it, and no deleted rows. Patching
    // that page would move the cursor past deletions this client never received.
    const outside = items.find((item) => {
      const seq = seqOf(item);
      return seq !== undefined && (seq <= afterSeq || seq > untilSeq);
    });
    if (outside) {
      console.warn(`[CacheOps] Range fetch: ${label} returned seq ${seqOf(outside)} → invalidation`);
      return failedRange('unsupported');
    }

    const newRows: ItemData[] = [];
    for (const entity of items) {
      const cached = findInCache<ItemData>(entityType, entity.id);
      if (applyServerEntity(entityType, entity, keys, organizationId, cached)) newRows.push(entity);
    }

    // Filtered lists filter on the server, so one invalidation per flush lets the active ones refetch and place new rows.
    if (newRows.length && organizationId) invalidateFilteredLists(entityType, keys.list.org(organizationId), newRows);

    if (items.length > 0) console.debug(`[CacheOps] Range fetch: ${label} patched ${items.length} entities`);
    const reachedSeq = items.reduce((max, item) => Math.max(max, seqOf(item) ?? 0), 0);
    return { status: 'ok', items, reachedSeq };
  } catch (error) {
    console.warn(`[CacheOps] Range fetch failed for ${label}, falling back to invalidation`, error);
    return failedRange('error');
  }
}
