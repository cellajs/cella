import type { QueryKey } from '@tanstack/react-query';
import { queryClient } from '~/query/query-client';
import type { BaseQueryItem, BaseQueryResponce, InfiniteQueryData, PageParams, QueryData } from '~/query/types';

/**
 * Extracts the items from a query, handling both paginated (infinite) and non-paginated query data.
 * @param prevItems - The previous query data, which can be either QueryData or InfiniteQueryData.
 * @returns - An array of items from the query.
 */
export const getQueryItems = <TItem>(prevItems: BaseQueryItem<TItem>) =>
  isQueryData(prevItems) ? prevItems.items : prevItems.pages.flatMap(({ items }) => items);

/**
 * Formats the updated data by preserving the structure of prev data and inserting new items in chunks.
 * Handles both regular query data and infinite query data formats.
 *
 * For infinite queries, it assumes **standard page parameters** of the shape:
 * `{ page: number; offset: number }`, and will generate new pageParams accordingly
 * if items are split into multiple pages.
 *
 * @param prevData - Previous query data, which can be either QueryData or InfiniteQueryData.
 * @param updatedData - New items to replace the previous data.
 * @param limit - Optional limit for chunk size when splitting the updated data (only used for InfiniteQueryData).
 * @param addToTotal - Optional total count to add to prev total.
 * @returns - The updated query data formatted in the appropriate structure.
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
 * Retrieves query data for a given query key.
 *
 * @param passedQueryKey - Query key to search for similar queries.
 * @returns An array with query key and its corresponding data.
 */
export const getExactQuery = <TItem, TPageParam = PageParams>(passedQueryKey: QueryKey): BaseQueryResponce<TItem, TPageParam> => {
  return [passedQueryKey, queryClient.getQueryData<BaseQueryItem<TItem, TPageParam>>(passedQueryKey)];
};

/**
 * Retrieves queries similar to the given query key.
 *
 * @param passedQueryKey - Query key to search for similar queries.
 * @returns An array of matching query keys and their corresponding data.
 */
export const getSimilarQueries = <TItem, TPageParam = PageParams>(passedQueryKey: QueryKey): BaseQueryResponce<TItem, TPageParam>[] => {
  return queryClient.getQueriesData<BaseQueryItem<TItem, TPageParam>>({ queryKey: passedQueryKey });
};
