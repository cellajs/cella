import { appConfig, hierarchy, type ProductEntityType } from 'shared';
import { asRecord } from 'shared/utils/as-record';
import { guardYjsOwnedFields } from '~/modules/common/blocknote/yjs-owned-fields';
import { resolveHomeChannelId, spliceEntitiesIntoListCaches } from '~/query/basic/apply-entity-to-lists';
import { cacheRemove, removeDetailQueriesOnceUnobserved, writeKeepingMark } from '~/query/basic/cache-mutations';
import {
  type EntityQueryKeys,
  getEntityQueryKeys,
  getEntityRangeFetch,
  getEqualityFilterKeys,
  hasEntityQueryKeys,
  rowOutsideRange,
  type SeqRange,
  seqOf,
  syncChunkSize,
} from '~/query/basic/entity-query-registry';
import { findInCache } from '~/query/basic/find-in-list-cache';
import type { ItemData, RoutableItemData } from '~/query/basic/types';
import { hasMutationOfRow, isPending } from '~/query/offline/mutation-queue';
import { queryClient } from '~/query/query-client';

/** A remote write skips the row while this is true, so optimistic state survives; the row the server returns when the mutation settles replaces the cached one. */
const hasPendingMutationForEntity = (entityType: ProductEntityType, entityId: string): boolean =>
  hasMutationOfRow(queryClient, entityType, entityId, isPending);

function isSoftDeleted(entity: ItemData): boolean {
  const deletedAt = asRecord(entity).deletedAt;
  return typeof deletedAt === 'string' && deletedAt.length > 0;
}

/** Removes one entity from detail and list caches without triggering a refetch; an organizationId narrows the list scan to that org. */
export function removeEntity(entityType: ProductEntityType, entityId: string, organizationId?: string): void {
  if (!hasEntityQueryKeys(entityType)) return;
  const keys = getEntityQueryKeys(entityType);
  queryClient.removeQueries({ queryKey: keys.detail.byId(entityId) });
  cacheRemove(organizationId ? keys.list.org(organizationId) : keys.list.base, [{ id: entityId }]);
}

export function invalidateEntityDetail(entityId: string, keys: EntityQueryKeys, refetchType: 'active' | 'none' = 'active'): void {
  queryClient.invalidateQueries({ queryKey: keys.detail.byId(entityId), refetchType });
}

/** Drops every cached detail of a type whose ancestor ids name the channel, the organization included, once nothing observes it. */
export function removeEntityDetailsBelow(entityType: ProductEntityType, channelId: string): void {
  const keys = getEntityQueryKeys(entityType);
  const columns = hierarchy.getOrderedAncestors(entityType).map((type) => appConfig.entityIdColumnKeys[type]);
  const below = queryClient
    .getQueriesData<ItemData>({ queryKey: keys.detail.base })
    .flatMap(([, row]) => (row && columns.some((column) => asRecord(row)[column] === channelId) ? [row.id] : []));
  removeDetailQueriesOnceUnobserved(queryClient, keys.detail.base, below);
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
const filtersExcludeRow = (filters: object[], row: Record<string, unknown>, equalityKeys: readonly string[]): boolean =>
  filters
    .flatMap((filter) => Object.entries(filter))
    .some(([key, value]) => {
      if (!equalityKeys.includes(key) || !isScalar(value) || value === '') return false;
      const rowValue = row[key];
      if (rowValue === null) return true;
      return isScalar(rowValue) && String(rowValue) !== String(value);
    });

/**
 * Invalidates org-scoped lists whose key tail holds a filter object; canonical home lists have string-only tails and are patched directly.
 * A list whose declared equality filters exclude every new row keeps its data, see `registerEqualityFilterKeys`.
 */
function invalidateFilteredLists(entityType: ProductEntityType, orgListKey: readonly unknown[], newRows: ItemData[]): void {
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
 * detail and rows new to a list guard against the cached copy read before any write.
 * @returns The rows every list lacked, so the caller can invalidate opaque filtered lists once.
 */
function applyServerRows(entityType: ProductEntityType, rows: ItemData[], keys: EntityQueryKeys, organizationId: string): ItemData[] {
  const tombstones = rows.filter(isSoftDeleted);
  const live = rows.filter((row) => {
    if (isSoftDeleted(row)) return false;
    if (!hasPendingMutationForEntity(entityType, row.id)) return true;
    console.debug(`[CacheOps] Skipping remote apply for ${entityType}:${row.id}, has pending mutation`);
    return false;
  });
  const references = new Map(live.map((row) => [row.id, findInCache<ItemData>(entityType, row.id)]));

  for (const { id } of tombstones) queryClient.removeQueries({ queryKey: keys.detail.byId(id) });
  for (const row of live) {
    const guarded = guardYjsOwnedFields(entityType, row, references.get(row.id));
    writeKeepingMark<ItemData>(queryClient, keys.detail.byId(row.id), (old) => old && { ...old, ...guarded });
  }

  const route = (row: ItemData): RoutableItemData => ({ ...row, entityType, organizationId });
  // Shared canonical-home policy: cached rows update in place, new rows insert only into the canonical home list, a row whose parent channel changed is removed.
  const { seen, spliced, sawFilteredList } = spliceEntitiesIntoListCaches(queryClient, [...tombstones, ...live].map(route), {
    isRemoved: isSoftDeleted,
    removeOnParentChannelChange: true,
    rowFor: (entity, cachedItem) => guardYjsOwnedFields(entityType, entity, cachedItem ?? references.get(entity.id)),
  });

  // A new row no home list spliced and no filtered list refetches stays invisible: a key-shape bug, canonical data cached outside keys.list.home.
  if (!sawFilteredList) {
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

/** `overflow` and `unsupported` deliver no row and `error` may retry; the caller marks the lists of a range that came back short or not at all. */
interface RangeFetchResult {
  status: 'ok' | 'overflow' | 'unsupported' | 'error';
  items: ItemData[];
  /** Highest seq actually returned; 0 when empty. Lets callers detect a short delivery. */
  reachedSeq: number;
}

const failedRange = (status: Exclude<RangeFetchResult['status'], 'ok'>): RangeFetchResult => ({ status, items: [], reachedSeq: 0 });

export async function fetchRangeAndPatch(
  entityType: ProductEntityType,
  organizationId: string,
  tenantId: string | null,
  range: SeqRange,
  keys: EntityQueryKeys,
  channelId?: string,
): Promise<RangeFetchResult> {
  if (!tenantId) {
    console.debug(`[CacheOps] No tenantId for ${entityType} range fetch, falling back to invalidation`);
    return failedRange('unsupported');
  }

  const rangeFetch = getEntityRangeFetch(entityType);
  if (!rangeFetch) return failedRange('unsupported');

  const { afterSeq, untilSeq } = range;
  const label = `${entityType} after ${afterSeq} until ${untilSeq}`;
  try {
    const { results: items } = await rangeFetch({ organizationId, tenantId, channelId, query: { ...range, maxPageSize: syncChunkSize } });

    // A stream flush fetches no backlog past one chunk: it reports overflow, and its caller marks the lists of the range.
    if (items.length >= syncChunkSize) {
      console.debug(`[CacheOps] Range fetch: ${label} overflows one chunk → invalidation`);
      return failedRange('overflow');
    }

    // Patching a page that ignored the range would move the cursor past deletions this client never received.
    const outside = rowOutsideRange(items, range);
    if (outside) {
      console.warn(`[CacheOps] Range fetch: ${label} returned seq ${seqOf(outside)} → invalidation`);
      return failedRange('unsupported');
    }

    const newRows = applyServerRows(entityType, items, keys, organizationId);

    // Filtered lists filter on the server, so one invalidation per flush lets the active ones refetch and place new rows.
    if (newRows.length) invalidateFilteredLists(entityType, keys.list.org(organizationId), newRows);

    if (items.length > 0) console.debug(`[CacheOps] Range fetch: ${label} patched ${items.length} entities`);
    const reachedSeq = items.reduce((max, item) => Math.max(max, seqOf(item) ?? 0), 0);
    return { status: 'ok', items, reachedSeq };
  } catch (error) {
    console.warn(`[CacheOps] Range fetch failed for ${label}, falling back to invalidation`, error);
    return failedRange('error');
  }
}
