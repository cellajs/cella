import type { QueryClient, QueryKey, QueryMeta, SkipToken } from '@tanstack/react-query';
import { asRecord } from 'shared/utils/as-record';
import { resolveHomeChannelId } from '~/query/basic/apply-entity-to-lists';
import { getEntityRangeFetch, syncChunkSize } from '~/query/basic/entity-query-registry';
import { getQueryItems, isInfiniteQueryData, isQueryData } from '~/query/basic/mutate-query';
import type { ItemData } from '~/query/basic/types';
import { isPending, rowIdsOfMutations } from '~/query/offline/mutation-queue';
import { deletedIdsOf } from '~/query/offline/mutation-variables';
import { syncStore } from '~/query/realtime/sync-store';
import type { PageParams, QueryData } from '~/query/types';

/**
 * Where a canonical list lives: its read is checked against this scope's cursor, and a range read is narrowed to it. Only
 * a home list, or the organization's list that spans homes, passes one: a range row cannot be checked against a server filter.
 */
export interface SyncedListScope {
  organizationId: string;
  tenantId: string;
  /** The home channel the list holds; none for an org-homed list or one that spans homes. */
  channelId?: string;
}

/** The query's context as a synced list's read gets it; its `signal` never aborts. */
interface ListReadContext<TKey> {
  client: QueryClient;
  queryKey: TKey;
  meta: QueryMeta | undefined;
  signal: AbortSignal;
}

interface PageReadContext<TKey> extends ListReadContext<TKey> {
  pageParam: PageParams;
  direction: 'forward' | 'backward';
}

type List = QueryData<ItemData>;
type Read<TContext> = (context: TContext) => List | Promise<List>;

type ListOptions<T extends { queryKey: QueryKey }> = { queryKey: QueryKey; queryFn?: SkipToken | Read<ListReadContext<T['queryKey']>> };
type PagedListOptions<T extends { queryKey: QueryKey }> = {
  queryKey: QueryKey;
  getNextPageParam: unknown;
  queryFn?: SkipToken | Read<PageReadContext<T['queryKey']>>;
};
type AnyListOptions = ListOptions<{ queryKey: QueryKey }> | PagedListOptions<{ queryKey: QueryKey }>;

/** The read's signal: query-core cancels a read that took the query's own signal once its last screen leaves. */
const neverAborted = new AbortController().signal;

/** The newest read of each canonical list, by query hash: an older read's range loop stops once a newer one starts. */
const newestReads = new Map<string, object>();

/** A canonical read whose overlapped changes could not be read: it fails, so the cache keeps its patched list, marked, and no toast shows. */
class OverlappedChangesError extends Error {}

/** The rows of the entity type's pending mutations, and of those the ones a delete removes. */
interface PendingRows {
  ids: Set<string>;
  deleted: Set<string>;
}

function pendingRows(client: QueryClient, entityType: string): PendingRows {
  return { ids: rowIdsOfMutations(client, entityType, isPending), deleted: rowIdsOfMutations(client, entityType, isPending, deletedIdsOf) };
}

const union = (a: PendingRows, b: PendingRows): PendingRows => ({
  ids: new Set([...a.ids, ...b.ids]),
  deleted: new Set([...a.deleted, ...b.deleted]),
});

/** The organization's cursor or the home channel's, whichever is further: catchup moves the first, the stream's ranges of the channel the second. */
function scopeCursor(entityType: string, { organizationId, channelId }: SyncedListScope): number {
  const store = syncStore.getState();
  const orgSeq = store.getOrgSeq(organizationId, entityType);
  return channelId ? Math.max(orgSeq, store.getChannelSeq(organizationId, channelId, entityType)) : orgSeq;
}

/** The org sequence position a product row carries, which `ItemData` does not type. */
function seqOf(row: ItemData): number | undefined {
  const { seq } = asRecord(row);
  return typeof seq === 'number' ? seq : undefined;
}

/** A live range row belongs to a home list when it is homed there, and to a list that spans homes always. */
function fitsList(entityType: string, queryKey: QueryKey, row: ItemData): boolean {
  const { deletedAt } = asRecord(row);
  if (typeof deletedAt === 'string' && deletedAt.length > 0) return false;
  // A home key ends with its channel's id (`createEntityKeys`), a key that spans homes with its filters.
  const [, , , homeChannelId] = queryKey;
  return typeof homeChannelId !== 'string' || resolveHomeChannelId(entityType, row) === homeChannelId;
}

/** The read with a later range applied: a range row replaces its copy or enters where it fits, and leaves where it no longer does. */
function withRange(read: List, rows: ItemData[], fits: (row: ItemData) => boolean): List {
  if (!rows.length) return read;
  const ranged = new Map(rows.map((row) => [row.id, row]));
  const items = read.items.flatMap((item) => {
    const row = ranged.get(item.id);
    if (!row) return [item];
    return fits(row) ? [row] : [];
  });
  const readIds = new Set(read.items.map(({ id }) => id));
  const entered = rows.filter((row) => !readIds.has(row.id) && fits(row));
  return { items: [...entered, ...items], total: read.total + entered.length + items.length - read.items.length };
}

/**
 * The rows the scope's cursor moved past since `afterSeq`, read a chunk at a time and again from the cursor each time it
 * moved meanwhile, until it stops or `isCurrent` says a newer read or a cancel replaced this one.
 * @throws {OverlappedChangesError} When a range read fails or answers rows outside its range.
 */
async function readOverlapped(entityType: string, scope: SyncedListScope, afterSeq: number, isCurrent: () => boolean): Promise<ItemData[]> {
  const rangeFetch = getEntityRangeFetch(entityType);
  const { organizationId, tenantId, channelId } = scope;
  const ranged = new Map<string, ItemData>();
  let fromSeq = afterSeq;
  let untilSeq = scopeCursor(entityType, scope);

  while (rangeFetch && fromSeq < untilSeq && isCurrent()) {
    const query = { afterSeq: fromSeq, untilSeq, limit: syncChunkSize };
    const answer = await rangeFetch({ organizationId, tenantId, channelId, query }).catch((cause) => {
      throw new OverlappedChangesError('The changes a list read overlapped could not be read', { cause });
    });
    const seqs = answer.items.flatMap((row) => seqOf(row) ?? []);
    // As `fetchRangeAndPatch` reads it: a server that ignored the range answers an ordinary page, with no tombstones.
    if (seqs.some((seq) => seq <= query.afterSeq || seq > untilSeq)) throw new OverlappedChangesError('A range read answered rows outside its range');
    for (const row of answer.items) ranged.set(row.id, row);

    // Each row change has a position of its own, so a full chunk, ordered by position, continues after its newest row.
    const full = answer.items.length >= syncChunkSize;
    const newest = Math.max(fromSeq, ...seqs);
    if (full && newest === fromSeq) throw new OverlappedChangesError('A full range chunk carried no positions');
    fromSeq = full ? newest : untilSeq;
    // Changes may have arrived while the range was read.
    if (fromSeq >= untilSeq) untilSeq = scopeCursor(entityType, scope);
  }
  return [...ranged.values()];
}

/** Marks a list for a refetch once query-core has cached `list`: a queryFn cannot mark its own result, whose success clears the mark. */
function markOnceCached(client: QueryClient, queryHash: string, list: List): void {
  // A cache listener runs within the success that caches the read; a microtask from the queryFn runs before it.
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.query.queryHash !== queryHash) return;
    const settled = event.type === 'updated' && (event.action.type === 'error' || (event.action.type === 'success' && !event.action.manual));
    if (event.type !== 'removed' && !settled) return;
    unsubscribe();
    if (event.query.state.data === list) event.query.invalidate();
  });
}

/**
 * Reads a canonical list and merges the changes the scope's cursor moved past while it ran, whose patches the read's result
 * overwrites. The range starts at the cursor the read started at, 0 before the scope's first catchup.
 * @throws {OverlappedChangesError} When the overlapped changes cannot be read and the list has data, which the failed read keeps.
 */
async function readAgainstDeltas(client: QueryClient, read: () => Promise<List>, queryKey: QueryKey, scope: SyncedListScope): Promise<List> {
  const entityType = String(queryKey[0]);
  const queryHash = client.defaultQueryOptions({ queryKey }).queryHash;
  const token = {};
  newestReads.set(queryHash, token);
  const isCurrent = () => newestReads.get(queryHash) === token && client.getQueryCache().get(queryHash)?.state.fetchStatus === 'fetching';

  try {
    const startCursor = scopeCursor(entityType, scope);
    const data = await read();
    const rows = await readOverlapped(entityType, scope, startCursor, isCurrent).catch((error) => {
      // A list with no data takes the read and a mark, the engine's answer to a range it cannot read.
      if (client.getQueryData(queryKey) !== undefined) throw error;
      markOnceCached(client, queryHash, data);
      return [];
    });
    return withRange(data, rows, (row) => fitsList(entityType, queryKey, row));
  } finally {
    if (newestReads.get(queryHash) === token) newestReads.delete(queryHash);
  }
}

/**
 * The read with each row a mutation held when the read started or ends as the cache holds it: the cached row, which a
 * settle has replaced with the stored one, and none where a delete removed it. A row the cache lacks for another mutation
 * stays as read. A whole list also takes back every cached row of such a mutation that the read lacks, such as an
 * optimistic create; a page does not, or every page would. A page records the rows whose delete is still pending, which
 * its offsets still count; one a delete removed while the read ran is gone from the server. A list with no data takes the read.
 */
function keepPendingRows(client: QueryClient, queryKey: QueryKey, read: List, atStart: PendingRows, atEnd: PendingRows, wholeList: boolean): List {
  const cached = client.getQueryData(queryKey);
  const pending = union(atStart, atEnd);
  if ((!isQueryData<ItemData>(cached) && !isInfiniteQueryData<ItemData>(cached)) || !pending.ids.size) return read;

  const cachedRows = new Map(
    getQueryItems(cached)
      .filter(({ id }) => pending.ids.has(id))
      .map((row) => [row.id, row]),
  );
  const hidden = new Set(read.items.filter(({ id }) => pending.deleted.has(id) && !cachedRows.has(id)).map(({ id }) => id));
  const items = read.items.flatMap((row) => (hidden.has(row.id) ? [] : [cachedRows.get(row.id) ?? row]));
  if (!wholeList) {
    const hiddenIds = [...hidden].filter((id) => atEnd.deleted.has(id));
    const page = { ...read, items, total: read.total - (hidden.size - hiddenIds.length) };
    return hiddenIds.length ? { ...page, hiddenIds } : page;
  }

  const readIds = new Set(read.items.map(({ id }) => id));
  const takenBack = [...cachedRows.values()].filter(({ id }) => !readIds.has(id));
  return { items: [...takenBack, ...items], total: read.total + takenBack.length - hidden.size };
}

/** A synced product list's options, as the module builds them, with the sync engine's read rules; a canonical list passes its `scope`. */
export function syncedListOptions<T extends ListOptions<T>>(options: T, scope?: SyncedListScope): T;
export function syncedListOptions<T extends PagedListOptions<T>>(options: T): T;
export function syncedListOptions(options: AnyListOptions, scope?: SyncedListScope): AnyListOptions {
  const { queryKey } = options;
  const entityType = String(queryKey[0]);

  if ('getNextPageParam' in options) {
    const { queryFn: readPage } = options;
    if (typeof readPage !== 'function') return options;
    return Object.assign(
      { ...options },
      {
        queryFn: async ({ client, meta, pageParam, direction }: Omit<PageReadContext<QueryKey>, 'queryKey' | 'signal'>) => {
          const pendingAtStart = pendingRows(client, entityType);
          const page = await readPage({ client, queryKey, meta, pageParam, direction, signal: neverAborted });
          return keepPendingRows(client, queryKey, page, pendingAtStart, pendingRows(client, entityType), false);
        },
      },
    );
  }

  const { queryFn: readList } = options;
  if (typeof readList !== 'function') return options;
  return Object.assign(
    { ...options },
    {
      queryFn: async ({ client, meta }: Omit<ListReadContext<QueryKey>, 'queryKey' | 'signal'>) => {
        const pendingAtStart = pendingRows(client, entityType);
        const read = async () => readList({ client, queryKey, meta, signal: neverAborted });
        const list = scope ? await readAgainstDeltas(client, read, queryKey, scope) : await read();
        return keepPendingRows(client, queryKey, list, pendingAtStart, pendingRows(client, entityType), true);
      },
    },
  );
}
