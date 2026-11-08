import type { QueryKey } from '@tanstack/react-query';
import { isRecord } from 'shared/utils/as-record';
import type { ItemData } from '~/query/basic/types';
import { queryClient } from '~/query/query-client';
import type { BaseQueryItem, BaseQueryResponse, InfiniteQueryData, PageParam, QueryData } from '~/query/types';

/**
 * The rows of a list. A row a later page repeats shows once, where the earlier page has it: a row that entered the list
 * before a page's position moves the next page back by one.
 */
export function getQueryItems<TItem>(data: QueryData<TItem> | { pages: QueryData<TItem>[] }): TItem[] {
  if ('results' in data) return data.results;
  const seen = new Set<unknown>();
  return data.pages
    .flatMap(({ results }) => results)
    .filter((row) => {
      const id = isRecord(row) ? row.id : undefined;
      if (id === undefined) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

export const isQueryData = <TItem>(data: unknown): data is QueryData<TItem> =>
  typeof data === 'object' && data !== null && 'results' in data && 'totalSize' in data;

export const isInfiniteQueryData = <TItem>(data: unknown): data is InfiniteQueryData<TItem> =>
  typeof data === 'object' && data !== null && 'pages' in data && 'pageParams' in data;

/** Visits every flat or paged list cached under `prefix`. */
export function forEachListQuery<TItem = ItemData>(prefix: QueryKey, visit: (queryKey: QueryKey, data: BaseQueryItem<TItem>) => void): void {
  for (const [queryKey, data] of queryClient.getQueriesData({ queryKey: prefix })) {
    if (isQueryData<TItem>(data) || isInfiniteQueryData<TItem>(data)) visit(queryKey, data);
  }
}

/** Maps items page by page and adds `totalDelta` to every total; a page whose items come back as the same array keeps its object, and so does unchanged data. */
export function mapListItems<TItem>(
  data: BaseQueryItem<TItem>,
  mapItems: (items: TItem[], pageIndex: number) => TItem[],
  totalDelta = 0,
): BaseQueryItem<TItem> {
  if (isQueryData<TItem>(data)) {
    const results = mapItems(data.results, 0);
    return results === data.results && !totalDelta ? data : { ...data, results, totalSize: data.totalSize + totalDelta };
  }

  let changed = false;
  const pages = data.pages.map((page, index) => {
    const results = mapItems(page.results, index);
    if (results === page.results && !totalDelta) return page;
    changed = true;
    return { ...page, results, totalSize: page.totalSize + totalDelta };
  });
  return changed ? { ...data, pages } : data;
}

/** Matches every query whose key starts with `queryKey`. */
export const getSimilarQueries = <TItem, TPageParam = PageParam>(queryKey: QueryKey): BaseQueryResponse<TItem, TPageParam>[] =>
  queryClient.getQueriesData<BaseQueryItem<TItem, TPageParam>>({ queryKey });
