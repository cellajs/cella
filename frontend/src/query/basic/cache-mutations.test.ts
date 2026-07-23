import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { removeDetailQueriesById } from '~/query/basic/cache-mutations';

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
