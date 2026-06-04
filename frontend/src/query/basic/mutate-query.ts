import type { QueryKey } from '@tanstack/react-query';
import { queryClient } from '~/query/query-client';
import type { BaseQueryItem, BaseQueryResponse, InfiniteQueryData, PageParams, QueryData } from '~/query/types';

/**
 * Returns the items array from a query, supporting both standard and infinite (paginated) query data.
 */
export const getQueryItems = <TItem>(prevItems: BaseQueryItem<TItem>) =>
  isQueryData(prevItems) ? prevItems.items : prevItems.pages.flatMap(({ items }) => items);

/**
 * Replaces the items in a query while preserving the structure of the previous data, splitting
 * into chunks for infinite queries. Optionally adjusts the cached `total` via `addToTotal`.
 * Infinite queries assume **standard page parameters** of shape `{ page: number; offset: number }`.
 */
export function formatUpdatedCacheData<TItem>(
  prevData: BaseQueryItem<TItem>,
  updatedData: TItem[],
  limit?: number,
  addToTotal = 0,
): BaseQueryItem<TItem> {
  // If the query is a standard (non-infinite) query, simply replace the items and update total
  if (isQueryData(prevData)) return { total: prevData.total + addToTotal, items: updatedData };

  // Handle case where all items are deleted: return empty InfiniteQueryData
  if (!updatedData.length) return { pageParams: [{ page: 0, offset: 0 }], pages: [{ items: [], total: 0 }] };

  // Determine chunk size for pages or use the size of the first existing page (for consistency)
  const pageItemsLimit = limit ?? (prevData.pages.length > 1 ? prevData.pages[0].items.length : null);

  // If no limit, put all updated data into a single page
  if (!pageItemsLimit) {
    return {
      ...prevData,
      pages: [{ total: (prevData.pages[0]?.total ?? 0) + addToTotal, items: updatedData }],
    };
  }

  // Split updatedData into chunks of size `pageItemsLimit`
  const chunks: TItem[][] = [];
  for (let i = 0; i < updatedData.length; i += pageItemsLimit) {
    chunks.push(updatedData.slice(i, i + pageItemsLimit));
  }

  const oldTotal = prevData.pages[0]?.total ?? 0;

  // Generate new pageParams for each page
  const totalPages = chunks.length;
  const newPages = Array.from({ length: totalPages }, (_, i) => ({ page: i, offset: chunks[i].length }));

  // Return updated InfiniteQueryData
  return {
    ...prevData,
    pageParams: newPages,
    pages: chunks.map((chunk) => ({
      total: oldTotal + addToTotal,
      items: chunk,
    })),
  };
}

/**
 * Type guard: checks if data is a standard QueryData
 */
export const isQueryData = <TItem>(data: unknown): data is QueryData<TItem> => {
  return typeof data === 'object' && data !== null && 'items' in data && 'total' in data;
};

/**
 * Type guard: checks if data is an InfiniteQueryData.
 * Assumes **standard** `PageParams` in the format `{ page: number; offset: number }`.
 */
export const isInfiniteQueryData = <TItem>(data: unknown): data is InfiniteQueryData<TItem> => {
  return typeof data === 'object' && data !== null && 'pages' in data && 'pageParams' in data;
};

/**
 * Returns queries whose key is similar to (i.e. matches a prefix of) `passedQueryKey`.
 */
export const getSimilarQueries = <TItem, TPageParam = PageParams>(
  passedQueryKey: QueryKey,
): BaseQueryResponse<TItem, TPageParam>[] => {
  return queryClient.getQueriesData<BaseQueryItem<TItem, TPageParam>>({ queryKey: passedQueryKey });
};
