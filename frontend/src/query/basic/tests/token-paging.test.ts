import '~/query/tests/query-client-env';
import { InfiniteQueryObserver, infiniteQueryOptions, QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '~/lib/api';
import { tokenPaging } from '~/query/basic/infinite-query-options';
import type { QueryData } from '~/query/types';

// A token dies when the list's params change shape or the key that seals tokens rotates: a list restored from the
// persisted cache toasted a 400 on its next page and stalled there.
describe('a paged list whose next page token the server no longer opens', () => {
  it('starts over from its first page without a toast, and toasts a token of that fresh page that dies too', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const reads: string[] = [];
    const readPage = async (pageToken: string): Promise<QueryData<{ id: string }>> => {
      reads.push(pageToken);
      if (pageToken) throw new ApiError({ status: 400, type: 'invalid_page_token' });
      return { results: [{ id: 'a' }], totalSize: 2, nextPageToken: 'dead' };
    };
    const paging = tokenPaging(readPage);
    const options = infiniteQueryOptions({ queryKey: ['attachment', 'list', 'dead-token'], ...paging });
    const list = new InfiniteQueryObserver(client, options);
    const leave = list.subscribe(() => {});
    await vi.waitFor(() => expect(list.getCurrentResult().isSuccess).toBe(true));
    const toasts = (error: ApiError | null) => !!error && !paging.meta.suppressGlobalErrorToast(error);

    const dead = await list.fetchNextPage();
    expect(toasts(dead.error)).toBe(false);
    await vi.waitFor(() => expect(reads).toEqual(['', 'dead', '']));
    await vi.waitFor(() =>
      expect(list.getCurrentResult()).toMatchObject({ isSuccess: true, hasNextPage: true, data: { pages: [{ results: [{ id: 'a' }] }] } }),
    );

    const deadAgain = await list.fetchNextPage();
    expect(toasts(deadAgain.error)).toBe(true);
    expect(reads).toEqual(['', 'dead', '', 'dead']);
    leave();
  });
});
