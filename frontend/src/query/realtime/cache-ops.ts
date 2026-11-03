import type { ProductEntityType } from 'shared';
import { asRecord } from 'shared/utils/as-record';
import { guardYjsOwnedFields } from '~/modules/common/blocknote/yjs-owned-fields';
import { resolveHomeChannelId, spliceEntitiesIntoListCaches } from '~/query/basic/apply-entity-to-lists';
import { cacheRemove, writeKeepingMark } from '~/query/basic/cache-mutations';
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
import { hasMutationOfRow, isPending } from '~/query/offline/mutation-queue';
import { queryClient } from '~/query/query-client';

/** Callers skip remote cache writes while this is true, so optimistic state survives; the row the server returns when the mutation settles replaces the cached one. */
function hasPendingMutationForEntity(entityType: string, entityId: string): boolean {
  return hasMutationOfRow(queryClient, entityType, entityId, isPending);
}

function isSoftDeleted(entity: ItemData): boolean {
  const deletedAt = asRecord(entity).deletedAt;
  return typeof deletedAt === 'string' && deletedAt.length > 0;
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
 * Applies server rows of one type and organization to detail and list caches, writing each list once: tombstones remove,
 * new rows enter only home lists, a row with a pending mutation is skipped, and only a cached detail is written, since a
 * detail read without one starts from the list copy. Each cached list row guards its Yjs-owned fields against itself; a
 * detail and rows new to a list guard against `referenceOf`, read before any write.
 * @returns The rows every list lacked, so the caller can invalidate opaque filtered lists once.
 */
function applyServerRows(
  entityType: string,
  rows: ItemData[],
  keys: EntityQueryKeys,
  organizationId: string | null,
  referenceOf: (row: ItemData) => ItemData | undefined = (row) => findInCache(entityType, row.id),
): ItemData[] {
  const tombstones = rows.filter(isSoftDeleted);
  const live = rows.filter((row) => {
    if (isSoftDeleted(row)) return false;
    if (!hasPendingMutationForEntity(entityType, row.id)) return true;
    console.debug(`[CacheOps] Skipping remote apply for ${entityType}:${row.id}, has pending mutation`);
    return false;
  });
  const references = new Map(live.map((row) => [row.id, referenceOf(row)]));

  for (const { id } of tombstones) queryClient.removeQueries({ queryKey: keys.detail.byId(id) });
  for (const row of live) {
    const guarded = guardYjsOwnedFields(entityType, row, references.get(row.id));
    writeKeepingMark<ItemData>(queryClient, keys.detail.byId(row.id), (old) => old && { ...old, ...guarded });
  }

  const route = (row: ItemData): RoutableItemData => ({ ...row, entityType, organizationId: organizationId ?? undefined });
  // Shared canonical-home policy: cached rows update in place, new rows insert only into the canonical home list, a row whose parent channel changed is removed.
  const { seen, spliced, sawFilteredList } = spliceEntitiesIntoListCaches(queryClient, [...tombstones, ...live].map(route), {
    isRemoved: isSoftDeleted,
    removeOnParentChannelChange: true,
    rowFor: (entity, cachedItem) => guardYjsOwnedFields(entityType, entity, cachedItem ?? references.get(entity.id)),
  });

  // A new row no home list spliced and no filtered list refetches stays invisible: a key-shape bug, canonical data cached outside keys.list.home.
  if (organizationId && !sawFilteredList) {
    for (const row of live) {
      const homeChannelId = resolveHomeChannelId(entityType, route(row));
      if (!homeChannelId || seen.has(row.id) || spliced.has(row.id)) continue;
      console.warn(
        `[CacheOps] New ${entityType} row ${row.id} reached no list cache: ` +
          `no canonical home list ${JSON.stringify(keys.list.home(organizationId, homeChannelId))} and no filtered list to invalidate.`,
      );
    }
  }

  return live.filter((row) => !seen.has(row.id));
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
  // Don't even fetch for entities with pending mutations; applyServerRows re-checks on apply.
  if (hasPendingMutationForEntity(entityType, entityId)) {
    console.debug(`[CacheOps] Skipping remote ${action} for ${entityType}:${entityId}, has pending mutation`);
    return;
  }

  // Read before the fetch, which writes the detail: without a list copy, the guard compares against the row as it was.
  const cached = findInCache<ItemData>(entityType, entityId);

  try {
    const entity = await queryClient.query<ItemData>({
      queryKey: keys.detail.byId(entityId),
      staleTime: 0,
      meta: { organizationId, tenantId: tenantId ?? undefined },
    });
    if (!entity) return;

    // The fetch replaced the detail, so its guard compares against a list copy, which a patch made meanwhile also reached, else the row read before.
    const listCopy = findInCache<ItemData>(entityType, (item) => item.id === entityId);
    applyServerRows(entityType, [entity], keys, organizationId, () => listCopy ?? cached);
    // The change says create: active filtered lists refetch to place the new row.
    if (action === 'create') invalidateFilteredLists(entityType, keys.list.org(organizationId), [entity]);
  } catch {
    // Any failure (no query defaults for the type, a network error, a 403 or 404): every list of the type refetches.
    invalidateEntityList(keys, 'all');
  }
}

/** `overflow` and `unsupported` deliver no row and `error` may retry; the caller marks the lists of a range that came back short or not at all. */
export interface RangeFetchResult {
  status: 'ok' | 'overflow' | 'unsupported' | 'error';
  items: ItemData[];
  /** Highest seq actually returned; 0 when empty. Lets callers detect a short delivery. */
  reachedSeq: number;
}

const failedRange = (status: Exclude<RangeFetchResult['status'], 'ok'>): RangeFetchResult => ({ status, items: [], reachedSeq: 0 });

/** The org sequence a product row carries, which `ItemData` does not type. */
const seqOf = (item: ItemData): number | undefined => {
  const { seq } = asRecord(item);
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

    // A full chunk may truncate the range: report overflow so the caller marks the lists before it moves past unseen rows.
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

    const newRows = applyServerRows(entityType, items, keys, organizationId);

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
