import { hashKey, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { ApiError } from '~/lib/api';
import { getQueryItems, isInfiniteQueryData } from '~/query/basic/mutate-query';
import type { PageParam, QueryData, SortOrder } from '~/query/types';

/** Pages a list by the `nextPageToken` each page names, until one names none. staleTime is omitted so it inherits the global default from query-client.ts. */
export const baseInfiniteQueryOptions = {
  initialPageParam: '',
  getNextPageParam: (lastPage: QueryData<unknown>): PageParam | undefined => lastPage.nextPageToken,
};

/** The paging params of one page read; the first page sends no token. */
export function pageQuery(maxPageSize: number, pageToken: PageParam) {
  return pageToken ? { maxPageSize, pageToken } : { maxPageSize };
}

/** A list starts over once a minute at most: a token of a fresh first page that dies too is a server fault, which toasts. */
const restartInterval = 60_000;

/** When each list last started over, by query hash. */
const restartedAt = new Map<string, number>();

/** Errors that started their list over, which the global handler shows no toast for. */
const restartErrors = new WeakSet<Error>();

/** Resets the list to its first page once the failed read has settled into the query's state. */
const startOver = (client: QueryClient, queryKey: QueryKey, error: ApiError) => {
  const hash = hashKey(queryKey);
  if (Date.now() - (restartedAt.get(hash) ?? 0) < restartInterval) return;
  restartedAt.set(hash, Date.now());
  restartErrors.add(error);
  setTimeout(() => client.resetQueries({ queryKey, exact: true }));
};

type TokenPageContext = { pageParam: PageParam; signal: AbortSignal; client: QueryClient; queryKey: QueryKey };

/**
 * Token paging over a list endpoint: the queryFn reads the page the page param's token names. A token the server no
 * longer opens (`invalid_page_token`: the list's params changed shape, or the key that seals tokens rotated, as for a
 * list restored from the persisted cache) starts the list over from its first page, without the global toast. A
 * call site that sets `meta` of its own spreads this `meta` into it.
 */
export function tokenPaging<TPage extends QueryData<unknown>>(fetchPage: (pageToken: PageParam, signal: AbortSignal) => Promise<TPage>) {
  return {
    queryFn: async ({ pageParam, signal, client, queryKey }: TokenPageContext) => {
      try {
        return await fetchPage(pageParam, signal);
      } catch (error) {
        if (pageParam && error instanceof ApiError && error.type === 'invalid_page_token') startOver(client, queryKey, error);
        throw error;
      }
    },
    meta: { suppressGlobalErrorToast: (error: ApiError) => restartErrors.has(error) },
    ...baseInfiniteQueryOptions,
  };
}

/** A list's `orderBy` param from the sort and order a cache key holds. */
export const orderByParam = <TSort extends string>(sort: TSort, order: SortOrder): `${TSort} ${SortOrder}` => `${sort} ${order}`;

type Live<T> = Exclude<T, { deletedAt: string }>;

/** A product list page outside a range read, which returns no tombstones: the filter drops none and narrows the row type. */
export const liveItems = <T extends { deletedAt: string | null }>({ results, ...page }: QueryData<T>): QueryData<Live<T>> => ({
  ...page,
  results: results.filter((item): item is Live<T> => item.deletedAt === null),
});

/** Parts whose absence on a row means the list was fetched without asking for them. */
const listIncludes = ['counts', 'members'] as const;

/**
 * `refetchOnMount` for a list whose cache entry it shares with lists fetched with fewer `include` parts: when
 * this one asks for counts or member previews and the cached rows lack them, it refetches while the entry is fresh.
 * A part sits under the row's `included`, or on the row itself for a member.
 */
export function refetchOnMountForIncluded(include: string | undefined) {
  const wanted = listIncludes.filter((part) => include?.split(',').includes(part));
  if (!wanted.length) return true;
  return ({ state }: { state: { data?: unknown } }): boolean | 'always' => {
    const firstRow = isInfiniteQueryData<{ included?: Record<string, unknown>; counts?: unknown }>(state.data)
      ? getQueryItems(state.data)[0]
      : undefined;
    return firstRow && wanted.some((part) => firstRow.included?.[part] === undefined && (part !== 'counts' || firstRow.counts === undefined))
      ? 'always'
      : true;
  };
}
