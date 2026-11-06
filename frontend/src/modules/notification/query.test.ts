import '~/query/tests/query-client-env';
import type { ListNotificationsResponse } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The hook returns its options, so the optimistic patch runs without rendering.
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useMutation: (options: unknown) => options,
}));

const { queryClient } = await import('~/query/query-client');
const { notificationKeys, useMarkNotificationsReadMutation } = await import('~/modules/notification/query');

type MarkReadOptions = { onMutate: (body: { ids?: string[] }) => Promise<unknown> };

/** The mocked useMutation hands back its options, which the hook's return type does not describe. */
const options = () => useMarkNotificationsReadMutation() as unknown as MarkReadOptions;

const unread = (id: string) => ({ id, contextId: id, readAt: null }) as ListNotificationsResponse['results'][number];

afterEach(() => queryClient.clear());

describe('useMarkNotificationsReadMutation', () => {
  it('marks the row read in the cached page and leaves the unread count to the server, which counts rows past the page', async () => {
    queryClient.setQueryData<ListNotificationsResponse>(notificationKeys.list, {
      results: [unread('a'), unread('b')],
      totalSize: 45,
      unreadCount: 45,
    });

    await options().onMutate({ ids: ['a'] });

    const cached = queryClient.getQueryData<ListNotificationsResponse>(notificationKeys.list);
    expect(cached?.results.map((item) => item.readAt !== null)).toEqual([true, false]);
    expect(cached?.unreadCount).toBe(45);
  });
});
