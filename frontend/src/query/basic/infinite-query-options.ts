import { isInfiniteQueryData } from '~/query/basic/mutate-query';
import type { PageParams, QueryData } from '~/query/types';

/** Pages any `{ items, total }` response until all are fetched. staleTime is omitted so it inherits the global default from query-client.ts. */
export const baseInfiniteQueryOptions = {
  initialPageParam: { page: 0, offset: 0 },
  getNextPageParam: (lastPage: QueryData<unknown>, allPages: QueryData<unknown>[]): PageParams | undefined => {
    // An empty page ends the list whatever `total` claims, so a drifted total cannot re-request one offset in a loop.
    if (lastPage.items.length === 0) return undefined;
    const fetchedCount = allPages.reduce((count, page) => count + page.items.length, 0);
    if (fetchedCount >= lastPage.total) return undefined;
    return { page: allPages.length, offset: fetchedCount };
  },
};

export function pageQuery(limit: number, offset: number) {
  return { limit, offset };
}

/** Offset paging over an `{ items, total }` endpoint: the queryFn fetches the page starting at the page param's offset. */
export function offsetPaging<TPage extends QueryData<unknown>>(limit: number, fetchPage: (offset: number, signal: AbortSignal) => Promise<TPage>) {
  return {
    queryFn: ({ pageParam: { page, offset }, signal }: { pageParam: PageParams; signal: AbortSignal }) =>
      fetchPage(offset ?? (page ?? 0) * limit, signal),
    ...baseInfiniteQueryOptions,
  };
}

type Live<T> = Exclude<T, { deletedAt: string }>;

/** A product list page outside a range read, which returns no tombstones: the filter drops none and narrows the row type. */
export const liveItems = <T extends { deletedAt: string | null }>({ items, total }: QueryData<T>): QueryData<Live<T>> => ({
  items: items.filter((item): item is Live<T> => item.deletedAt === null),
  total,
});

/** `included` parts whose absence on a row means the list was fetched without asking for them. */
const listIncludes = ['counts', 'members'] as const;

/**
 * `refetchOnMount` for a list whose cache entry it shares with lists fetched with fewer `include` parts: when
 * this one asks for counts or member previews and the cached rows lack them, it refetches while the entry is fresh.
 */
export function refetchOnMountForIncluded(include: string | undefined) {
  const wanted = listIncludes.filter((part) => include?.split(',').includes(part));
  if (!wanted.length) return true;
  return ({ state }: { state: { data?: unknown } }): boolean | 'always' => {
    const firstRow = isInfiniteQueryData<{ included?: Record<string, unknown> }>(state.data) ? state.data.pages[0]?.items[0] : undefined;
    return firstRow && wanted.some((part) => firstRow.included?.[part] === undefined) ? 'always' : true;
  };
}
