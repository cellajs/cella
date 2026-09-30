import type { QueryKey } from '@tanstack/react-query';
import type { ItemData } from '~/query/basic/types';
import { queryClient } from '~/query/query-client';
import type { BaseQueryItem, BaseQueryResponse, InfiniteQueryData, PageParams, QueryData } from '~/query/types';

/** Handles both standard and infinite query data. */
export const getQueryItems = <TItem>(prevItems: BaseQueryItem<TItem>) =>
  isQueryData(prevItems) ? prevItems.items : prevItems.pages.flatMap(({ items }) => items);

export const isQueryData = <TItem>(data: unknown): data is QueryData<TItem> => {
  return typeof data === 'object' && data !== null && 'items' in data && 'total' in data;
};

/** Assumes standard `PageParams` of the form `{ page: number; offset: number }`. */
export const isInfiniteQueryData = <TItem>(data: unknown): data is InfiniteQueryData<TItem> => {
  return typeof data === 'object' && data !== null && 'pages' in data && 'pageParams' in data;
};

/** Visits every flat or paged list cached under `prefix`. */
export function forEachListQuery<TItem = ItemData>(
  prefix: QueryKey,
  visit: (queryKey: QueryKey, data: BaseQueryItem<TItem>) => void,
): void {
  for (const [queryKey, data] of queryClient.getQueriesData({ queryKey: prefix })) {
    if (isQueryData<TItem>(data) || isInfiniteQueryData<TItem>(data)) visit(queryKey, data);
  }
}

/**
 * Maps list items page by page and adds `totalDelta` to every total. A page whose items come back as the same array
 * keeps its object, so without a change or a delta the data object itself returns.
 */
export function mapListItems<TItem>(
  data: BaseQueryItem<TItem>,
  mapItems: (items: TItem[], pageIndex: number) => TItem[],
  totalDelta = 0,
): BaseQueryItem<TItem> {
  if (isQueryData<TItem>(data)) {
    const items = mapItems(data.items, 0);
    return items === data.items && !totalDelta ? data : { ...data, items, total: data.total + totalDelta };
  }

  let changed = false;
  const pages = data.pages.map((page, index) => {
    const items = mapItems(page.items, index);
    if (items === page.items && !totalDelta) return page;
    changed = true;
    return { ...page, items, total: page.total + totalDelta };
  });
  return changed ? { ...data, pages } : data;
}

/** Matches every query whose key starts with `passedQueryKey`. */
export const getSimilarQueries = <TItem, TPageParam = PageParams>(
  passedQueryKey: QueryKey,
): BaseQueryResponse<TItem, TPageParam>[] => {
  return queryClient.getQueriesData<BaseQueryItem<TItem, TPageParam>>({ queryKey: passedQueryKey });
};
