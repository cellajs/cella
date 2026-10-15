import type { GetNextPageParamFunction, InfiniteData } from '@tanstack/react-query';
import type { PageParams, QueryData } from '~/query/types';

/** Pages any `{ items, total }` response until all are fetched. staleTime is omitted so it inherits the global default from query-client.ts. */
export const baseInfiniteQueryOptions = {
  initialPageParam: { page: 0, offset: 0 },
  getNextPageParam: ((lastPage, allPages) => {
    const total = lastPage.total;
    const fetchedCount = allPages.reduce((acc, page) => acc + page.items.length, 0);

    // An empty page means the server has no more rows regardless of what `total` claims; without
    // this guard a drifted denormalized total re-requests the same offset in an unthrottled loop.
    if (lastPage.items.length === 0) return undefined;
    if (fetchedCount >= total) return undefined;
    return { page: allPages.length, offset: fetchedCount };
  }) as GetNextPageParamFunction<PageParams, QueryData<unknown>>,
};

/** The limit and offset query params of one page. */
export const pageQuery = (limit: number, offset: number) => ({ limit: String(limit), offset: String(offset) });

/** Offset paging over an `{ items, total }` endpoint: the queryFn fetches the page starting at the page param's offset. */
export const offsetPaging = <TPage extends QueryData<unknown>>(
  limit: number,
  fetchPage: (offset: number, signal: AbortSignal) => Promise<TPage>,
) => ({
  queryFn: ({ pageParam: { page, offset }, signal }: { pageParam: PageParams; signal: AbortSignal }) =>
    fetchPage(offset ?? (page ?? 0) * limit, signal),
  ...baseInfiniteQueryOptions,
});

/**
 * `refetchOnMount` for a list whose cache entry it shares with lists fetched without counts: when this one asks for
 * counts and the cached rows have none, it refetches while the entry is still fresh.
 */
export const refetchOnMountForCounts = (include: string | undefined) =>
  include?.includes('counts')
    ? ({ state }: { state: { data?: unknown } }): boolean | 'always' => {
        const firstRow = (state.data as InfiniteData<QueryData<{ included?: { counts?: unknown } }>> | undefined)?.pages[0]?.items[0];
        return firstRow && !firstRow.included?.counts ? 'always' : true;
      }
    : true;
