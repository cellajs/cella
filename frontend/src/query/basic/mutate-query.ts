import type { QueryKey } from '@tanstack/react-query';
import type { ItemData } from '~/query/basic/types';
import { queryClient } from '~/query/query-client';
import type { BaseQueryItem, BaseQueryResponse, InfiniteQueryData, PageParams, QueryData } from '~/query/types';

export function getQueryItems<TItem>(data: BaseQueryItem<TItem>) {
  return isQueryData(data) ? data.items : data.pages.flatMap(({ items }) => items);
}

export function isQueryData<TItem>(data: unknown): data is QueryData<TItem> {
  return typeof data === 'object' && data !== null && 'items' in data && 'total' in data;
}

/** Assumes standard `PageParams` of the form `{ page: number; offset: number }`. */
export function isInfiniteQueryData<TItem>(data: unknown): data is InfiniteQueryData<TItem> {
  return typeof data === 'object' && data !== null && 'pages' in data && 'pageParams' in data;
}

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

/** Matches every query whose key starts with `queryKey`. */
export function getSimilarQueries<TItem, TPageParam = PageParams>(queryKey: QueryKey): BaseQueryResponse<TItem, TPageParam>[] {
  return queryClient.getQueriesData<BaseQueryItem<TItem, TPageParam>>({ queryKey });
}
