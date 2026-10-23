import type { GetNextPageParamFunction, InfiniteData } from '@tanstack/react-query';
import type { PageParams, QueryData } from '~/query/types';

/** Pages any `{ items, total }` response until all are fetched. staleTime is omitted so it inherits the global default from query-client.ts. */
export const baseInfiniteQueryOptions = {
  initialPageParam: { page: 0, offset: 0 },
  getNextPageParam: ((lastPage, allPages) => {
    const total = lastPage.total;
    const fetchedCount = allPages.reduce((count, page) => count + page.items.length, 0);

    // An empty page means the server has no more rows regardless of what `total` claims; without
    // this guard a drifted denormalized total re-requests the same offset in an unthrottled loop.
    if (lastPage.items.length === 0) return undefined;
    if (fetchedCount >= total) return undefined;
    return { page: allPages.length, offset: fetchedCount };
  }) as GetNextPageParamFunction<PageParams, QueryData<unknown>>,
};

/** The limit and offset query params of one page. */
export const pageQuery = (limit: number, offset: number) => ({ limit, offset });

/** Offset paging over an `{ items, total }` endpoint: the queryFn fetches the page starting at the page param's offset. */
export const offsetPaging = <TPage extends QueryData<unknown>>(
  limit: number,
  fetchPage: (offset: number, signal: AbortSignal) => Promise<TPage>,
) => ({
  queryFn: ({ pageParam: { page, offset }, signal }: { pageParam: PageParams; signal: AbortSignal }) =>
    fetchPage(offset ?? (page ?? 0) * limit, signal),
  ...baseInfiniteQueryOptions,
});

/** `included` parts whose absence on a row means the list was fetched without asking for them. */
const listIncludes = ['counts', 'members'] as const;

/**
 * `refetchOnMount` for a list whose cache entry it shares with lists fetched with fewer `include` parts: when
 * this one asks for counts or member previews and the cached rows lack them, it refetches while the entry is fresh.
 */
export const refetchOnMountForIncluded = (include: string | undefined) => {
  const wanted = listIncludes.filter((part) => include?.split(',').includes(part));
  if (!wanted.length) return true;
  return ({ state }: { state: { data?: unknown } }): boolean | 'always' => {
    const firstRow = (state.data as InfiniteData<QueryData<{ included?: Record<string, unknown> }>> | undefined)?.pages[0]?.items[0];
    return firstRow && wanted.some((part) => firstRow.included?.[part] === undefined) ? 'always' : true;
  };
};
