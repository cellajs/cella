import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { cancelKeepingMark, changeListData, removeDetailQueriesOnceUnobserved } from '~/query/basic/cache-mutations';
import { queryClient } from '~/query/query-client';

vi.mock('~/query/query-client', () => ({ queryClient: new QueryClient() }));

// A patch, or the cancel of a refetch a patch overlapped, cleared the mark: overflow recovery and the generation refetch were lost.
describe('a list marked for a refetch stays marked', () => {
  const key = ['task', 'list', 'org-1', 'org-1'];
  const markedList = async () => {
    queryClient.setQueryData(key, { items: [{ id: 'a', name: 'a' }], total: 1 }, { updatedAt: 1000 });
    await queryClient.invalidateQueries({ queryKey: key, refetchType: 'none' });
  };

  it('through a patch of a row the list does not hold, which writes nothing', async () => {
    await markedList();
    changeListData(key, [{ id: 'b' }], 'update');
    expect(queryClient.getQueryState(key)).toMatchObject({ isInvalidated: true, dataUpdatedAt: 1000 });
  });

  it('through a patch of a row it holds', async () => {
    await markedList();
    const renamed = { id: 'a', name: 'renamed' };
    changeListData(key, [renamed], 'update');
    expect(queryClient.getQueryState(key)).toMatchObject({ isInvalidated: true, data: { items: [renamed] } });
  });

  it('through a patch while it refetches, and an edit that cancels the refetch', async () => {
    await markedList();
    const refetch = queryClient.query({ queryKey: key, queryFn: () => new Promise(() => {}) });
    const renamed = { id: 'a', name: 'renamed' };
    changeListData(key, [renamed], 'update');
    await cancelKeepingMark(queryClient, ['task', 'list', 'org-1']);
    await refetch;
    expect(queryClient.getQueryState(key)).toMatchObject({ isInvalidated: true, fetchStatus: 'idle' });
  });
});

// An edit during a list's first read cancelled it, and nothing read it again: the table showed no rows until it remounted.
describe('an optimistic write during a first read', () => {
  it('lets the read finish', async () => {
    // An organization of its own: the tests above leave data under org-1's list, which would make this read warm.
    const key = ['task', 'list', 'org-2', 'org-2'];
    let answer: ((data: unknown) => void) | undefined;
    const read = queryClient.query({ queryKey: key, queryFn: () => new Promise((resolve) => (answer = resolve)) });
    await vi.waitFor(() => expect(answer).toBeDefined());

    await cancelKeepingMark(queryClient, ['task', 'list', 'org-2']);
    answer?.({ items: [{ id: 'a' }], total: 1 });
    await read.catch(() => {});
    expect(queryClient.getQueryState(key)).toMatchObject({ status: 'success', data: { items: [{ id: 'a' }] } });
  });
});

describe('removeDetailQueriesOnceUnobserved', () => {
  it('leaves a detail a page still shows until the page lets go of it, so the deleted row is not fetched again', () => {
    const client = new QueryClient();
    const key = ['organization', 'detail', 'org-1'];
    const fetchDetail = vi.fn(async () => 'fetched again');
    client.setQueryData(key, 'detail');
    // The settings page of the organization it just deleted: still mounted while the delete settles.
    const leavePage = new QueryObserver(client, { queryKey: key, queryFn: fetchDetail, staleTime: Number.POSITIVE_INFINITY }).subscribe(() => {});

    removeDetailQueriesOnceUnobserved(client, ['organization', 'detail'], ['org-1']);
    expect(client.getQueryData(key)).toBe('detail');

    leavePage();
    expect(client.getQueryData(key)).toBeUndefined();
    expect(fetchDetail).not.toHaveBeenCalled();
  });
});
