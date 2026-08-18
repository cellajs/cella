import type { QueryKey } from '@tanstack/react-query';
import { queryClient } from '~/query/query-client';
import type { BaseQueryItem, BaseQueryResponse, InfiniteQueryData, PageParams, QueryData } from '~/query/types';

/** Handles both standard and infinite query data. */
export const getQueryItems = <TItem>(prevItems: BaseQueryItem<TItem>) =>
  isQueryData(prevItems) ? prevItems.items : prevItems.pages.flatMap(({ items }) => items);

/** Preserves the previous structure, re-chunking into pages for infinite queries. `addToTotal` adjusts cached `total`, and page params are assumed to be `{ page, offset }`. */
export function formatUpdatedCacheData<TItem>(
  prevData: BaseQueryItem<TItem>,
  updatedData: TItem[],
  limit?: number,
  addToTotal = 0,
): BaseQueryItem<TItem> {
  if (isQueryData(prevData)) return { total: prevData.total + addToTotal, items: updatedData };

  // Every item was deleted.
  if (!updatedData.length) return { pageParams: [{ page: 0, offset: 0 }], pages: [{ items: [], total: 0 }] };

  // Without an explicit limit, the first existing page sets the chunk size.
  const pageItemsLimit = limit ?? (prevData.pages.length > 1 ? prevData.pages[0].items.length : null);

  if (!pageItemsLimit) {
    return {
      ...prevData,
      pages: [{ total: (prevData.pages[0]?.total ?? 0) + addToTotal, items: updatedData }],
    };
  }

  const chunks: TItem[][] = [];
  for (let i = 0; i < updatedData.length; i += pageItemsLimit) {
    chunks.push(updatedData.slice(i, i + pageItemsLimit));
  }

  const oldTotal = prevData.pages[0]?.total ?? 0;

  const totalPages = chunks.length;
  const newPages = Array.from({ length: totalPages }, (_, i) => ({ page: i, offset: chunks[i].length }));

  return {
    ...prevData,
    pageParams: newPages,
    pages: chunks.map((chunk) => ({
      total: oldTotal + addToTotal,
      items: chunk,
    })),
  };
}

export const isQueryData = <TItem>(data: unknown): data is QueryData<TItem> => {
  return typeof data === 'object' && data !== null && 'items' in data && 'total' in data;
};

/** Assumes standard `PageParams` of the form `{ page: number; offset: number }`. */
export const isInfiniteQueryData = <TItem>(data: unknown): data is InfiniteQueryData<TItem> => {
  return typeof data === 'object' && data !== null && 'pages' in data && 'pageParams' in data;
};

/** Matches every query whose key starts with `passedQueryKey`. */
export const getSimilarQueries = <TItem, TPageParam = PageParams>(
  passedQueryKey: QueryKey,
): BaseQueryResponse<TItem, TPageParam>[] => {
  return queryClient.getQueriesData<BaseQueryItem<TItem, TPageParam>>({ queryKey: passedQueryKey });
};
