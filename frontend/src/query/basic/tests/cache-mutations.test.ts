import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { removeDetailQueriesOnceUnobserved } from '~/query/basic/cache-mutations';

vi.mock('~/query/query-client', () => ({ queryClient: new QueryClient() }));

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
