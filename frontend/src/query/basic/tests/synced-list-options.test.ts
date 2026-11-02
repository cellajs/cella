import '~/query/tests/query-client-env';
import { InfiniteQueryObserver, infiniteQueryOptions, QueryClient, QueryObserver, queryOptions } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cacheRemove } from '~/query/basic/cache-mutations';
import { createEntityKeys } from '~/query/basic/create-query-keys';
import { registerEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { offsetPaging } from '~/query/basic/infinite-query-options';
import { syncedListOptions } from '~/query/basic/synced-list-options';
import { queryClient } from '~/query/query-client';
import { syncStore } from '~/query/realtime/sync-store';
import type { QueryData } from '~/query/types';

vi.mock('~/query/query-client', () => ({ queryClient: new QueryClient() }));

type Row = { id: string; name: string; seq: number; organizationId: string; deletedAt: string | null };

// The registry only needs an EntityType-shaped string; 'attachment' exists in every config.
const keys = createEntityKeys<{ q: string }>('attachment');
const scope = { organizationId: 'org-1', tenantId: 'tenant-1' };
const homeKey = keys.list.home(scope.organizationId);
const row = (id: string, name: string, seq = 1, deletedAt: string | null = null): Row => ({
  id,
  name,
  seq,
  deletedAt,
  organizationId: scope.organizationId,
});
const list = (...items: Row[]): QueryData<Row> => ({ items, total: items.length });
const names = (data: unknown) => (data as { items: Row[] } | undefined)?.items.map(({ id, name }) => `${id}:${name}`).sort();

let rangeRows: Row[] = [];
registerEntityQueryKeys('attachment', keys, async () => list(...rangeRows));

/** A read that answers when the test calls `answer`; `started` resolves once the query called it. */
function heldRead() {
  let answer!: (data: QueryData<Row>) => void;
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => (markStarted = resolve));
  const read = () => {
    markStarted();
    return new Promise<QueryData<Row>>((resolve) => (answer = resolve));
  };
  return { read, started, answer: (data: QueryData<Row>) => answer(data) };
}

/** A mutation of the row that stays pending, as an edit in flight or queued offline, until the returned function settles it. */
function pendingMutation(operation: string, variables: object) {
  let answer = () => {};
  const answered = new Promise<void>((resolve) => (answer = resolve));
  const done = queryClient
    .getMutationCache()
    .build(queryClient, { mutationKey: ['attachment', operation], mutationFn: () => answered })
    .execute(variables);
  return () => {
    answer();
    return done;
  };
}

afterEach(() => {
  queryClient.clear();
  syncStore.getState().reset();
  rangeRows = [];
});

// A full read that changes overlapped overwrote them, and the cursor had moved past: a rename showed the old name and a deleted row came back.
// A fresh profile's first catchup declares no view, so its whole first session reads at cursor 0.
describe('a canonical list read that changes overlapped', () => {
  it.each([
    ['in a first session', 0],
    ['in a caught-up scope', 1],
  ])('merges the range announced while it ran, %s', async (_, startCursor) => {
    queryClient.setQueryData(homeKey, list(row('a', 'old'), row('b', 'b')));
    syncStore.getState().setOrgSeq(scope.organizationId, 'attachment', startCursor);
    const { read, started, answer } = heldRead();
    const result = queryClient.query({ ...syncedListOptions(queryOptions({ queryKey: homeKey, queryFn: read }), scope), staleTime: 0 });
    await started;

    // The stream's range while the read runs: a rename, a delete and a create, with the cursor moved past them.
    rangeRows = [row('a', 'renamed', 2), row('b', 'b', 3, '2026-11-02T00:00:00.000Z'), row('c', 'created', 4)];
    syncStore.getState().setOrgSeq(scope.organizationId, 'attachment', 4);
    answer(list(row('a', 'old'), row('b', 'b')));

    expect(names(await result)).toEqual(['a:renamed', 'c:created']);
  });
});

// A refetch of a marked list replaced an optimistic row until its mutation settled: offline a queued edit showed the server value, a queued
// upload was missing and a queued delete was back.
describe('a list read that ends while rows have pending mutations', () => {
  it('keeps each such row as the cache holds it', async () => {
    queryClient.setQueryData(homeKey, list(row('edited', 'mine'), row('uploaded', 'queued upload'), row('other', 'cached')));
    pendingMutation('update', { id: 'edited', ops: { name: 'mine' } });
    pendingMutation('create', { data: [{ id: 'uploaded' }] });
    pendingMutation('delete', { rows: [{ id: 'deleted' }] });

    const read = async () => list(row('edited', 'server'), row('deleted', 'server'), row('other', 'server'));
    const result = await queryClient.query({ ...syncedListOptions(queryOptions({ queryKey: homeKey, queryFn: read })), staleTime: 0 });

    expect(names(result)).toEqual(['edited:mine', 'other:server', 'uploaded:queued upload']);
  });

  // A refetch that an own edit's settle overtook put the server's older row back, and an own echo moves no cursor to repair it.
  it('keeps the stored row of a mutation that settled while the read ran', async () => {
    queryClient.setQueryData(homeKey, list(row('edited', 'mine')));
    const settle = pendingMutation('update', { id: 'edited', ops: { name: 'mine' } });
    const { read, started, answer } = heldRead();
    const result = queryClient.query({ ...syncedListOptions(queryOptions({ queryKey: homeKey, queryFn: read })), staleTime: 0 });
    await started;

    await settle();
    queryClient.setQueryData(homeKey, list(row('edited', 'stored', 2)));
    answer(list(row('edited', 'server')));

    expect(names(await result)).toEqual(['edited:stored']);
  });
});

// A paged list read while rows of its first page had a pending delete: the emptied page ended the list, and a page that hid rows
// offset the next one short, so a row showed twice.
describe('a paged list read while rows of it have a pending delete', () => {
  it('hides them and pages by the rows the server sent, before and after the delete settles', async () => {
    let server = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => row(id, id));
    const readPage = async (offset: number) => ({ items: server.slice(offset, offset + 2), total: server.length });
    const options = syncedListOptions(infiniteQueryOptions({ queryKey: keys.list.filtered({ q: 'x' }), ...offsetPaging(2, readPage) }));
    const table = new InfiniteQueryObserver(queryClient, options);
    const leave = table.subscribe(() => {});
    await vi.waitFor(() => expect(table.getCurrentResult().isSuccess).toBe(true));
    await table.fetchNextPage();
    const rows = () => table.getCurrentResult().data?.pages.flatMap(({ items }) => items.map(({ id }) => id));

    const settle = pendingMutation('delete', { rows: [{ id: 'a' }, { id: 'b' }] });
    cacheRemove(['attachment', 'list'], [{ id: 'a' }, { id: 'b' }]);
    await table.refetch();
    expect({ rows: rows(), hasNextPage: table.getCurrentResult().hasNextPage }).toEqual({ rows: ['c', 'd'], hasNextPage: true });

    server = server.slice(2);
    await settle();
    cacheRemove(['attachment', 'list'], [{ id: 'a' }, { id: 'b' }]);
    await table.fetchNextPage();
    expect({ rows: rows(), hasNextPage: table.getCurrentResult().hasNextPage }).toEqual({ rows: ['c', 'd', 'e', 'f'], hasNextPage: false });
    leave();
  });
});

// The paged list consumed the query's abort signal, so the last observer leaving mid-refetch cancelled it with revert: the read was
// discarded and the list kept the unmarked state of its last patch.
describe('a paged list whose last observer leaves while it reads', () => {
  it('caches its read', async () => {
    const { read, started, answer } = heldRead();
    const options = syncedListOptions(infiniteQueryOptions({ queryKey: keys.list.filtered({ q: 'x' }), ...offsetPaging(10, () => read()) }));
    const leave = new InfiniteQueryObserver(queryClient, options).subscribe(() => {});
    await started;

    leave();
    answer(list(row('a', 'fresh')));

    await vi.waitFor(() => expect(queryClient.getQueryData(options.queryKey)?.pages[0].items).toEqual([row('a', 'fresh')]));
  });
});

describe('a marked list under an app whose global refetchOnMount is false', () => {
  it('refetches when a reader mounts', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { refetchOnMount: false, staleTime: Number.POSITIVE_INFINITY } } });
    let reads = 0;
    const options = syncedListOptions(
      queryOptions({
        queryKey: homeKey,
        queryFn: async () => {
          reads++;
          return list(row('a', 'fresh'));
        },
      }),
      scope,
    );
    client.setQueryData(homeKey, list(row('a', 'stale')));
    client.getQueryCache().find({ queryKey: homeKey, exact: true })?.invalidate();

    const unsubscribe = new QueryObserver(client, options).subscribe(() => {});
    await vi.waitFor(() => expect(reads).toBe(1));
    await vi.waitFor(() => expect(names(client.getQueryData(homeKey))).toEqual(['a:fresh']));
    unsubscribe();
  });
});
