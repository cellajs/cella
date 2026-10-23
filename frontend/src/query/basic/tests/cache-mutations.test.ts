import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { removeDetailQueriesById, removeDetailQueriesOnceUnobserved } from '~/query/basic/cache-mutations';

vi.mock('~/query/query-client', () => ({ queryClient: new QueryClient() }));

describe('removeDetailQueriesById', () => {
  it('removes only the selected detail queries and their descendants', () => {
    const client = new QueryClient();
    client.setQueryData(['attachment', 'detail', 'remove'], 'detail');
    client.setQueryData(['attachment', 'detail', 'remove', 'preview'], 'preview');
    client.setQueryData(['attachment', 'detail', 'keep'], 'other detail');
    client.setQueryData(['attachment', 'list'], 'list');
    client.setQueryData(['user', 'detail', 'remove'], 'other entity');

    removeDetailQueriesById(client, ['attachment', 'detail'], ['remove']);

    expect(client.getQueryData(['attachment', 'detail', 'remove'])).toBeUndefined();
    expect(client.getQueryData(['attachment', 'detail', 'remove', 'preview'])).toBeUndefined();
    expect(client.getQueryData(['attachment', 'detail', 'keep'])).toBe('other detail');
    expect(client.getQueryData(['attachment', 'list'])).toBe('list');
    expect(client.getQueryData(['user', 'detail', 'remove'])).toBe('other entity');
  });

  it('does not scan or remove queries for an empty ID set', () => {
    const client = new QueryClient();
    client.setQueryData(['attachment', 'detail', 'keep'], 'detail');

    removeDetailQueriesById(client, ['attachment', 'detail'], []);

    expect(client.getQueryData(['attachment', 'detail', 'keep'])).toBe('detail');
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

  it('stops waiting for a shown detail that something else removed first, such as a sign-out that clears the cache', () => {
    const client = new QueryClient();
    const key = ['organization', 'detail', 'org-1'];
    client.setQueryData(key, 'detail');
    new QueryObserver(client, { queryKey: key, queryFn: async () => 'detail', staleTime: Number.POSITIVE_INFINITY }).subscribe(() => {});

    removeDetailQueriesOnceUnobserved(client, ['organization', 'detail'], ['org-1']);
    expect(client.getQueryCache().hasListeners()).toBe(true);

    client.clear();
    expect(client.getQueryCache().hasListeners()).toBe(false);
  });

  it('removes a detail nobody shows at once', () => {
    const client = new QueryClient();
    client.setQueryData(['organization', 'detail', 'org-1'], 'detail');

    removeDetailQueriesOnceUnobserved(client, ['organization', 'detail'], ['org-1']);

    expect(client.getQueryData(['organization', 'detail', 'org-1'])).toBeUndefined();
  });
});
