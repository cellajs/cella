import type { QueryKey } from '@tanstack/react-query';
import { queryClient } from '~/query/query-client';
import type { InfiniteQueryData, QueryData } from '~/query/types';

/**
 * Extracts the items from a query, handling both paginated (infinite) and non-paginated query data.
 * @param prevItems - The previous query data, which can be either QueryData or InfiniteQueryData.
 * @returns - An array of items from the query.
 */
export const getQueryItems = <T>(prevItems: QueryData<T> | InfiniteQueryData<T>) => {
  // Check if the data is of type QueryData or InfiniteQueryData and extract items accordingly
  return isQueryData(prevItems) ? prevItems.items : prevItems.pages.flatMap((page) => page.items);
};

/**
 * Formats the updated data by preserving the structure of prev data and inserting new items in chunks.
 * Handles both regular query data and infinite query data formats.
 * @param prevData - Previous query data, which can be either QueryData or InfiniteQueryData.
 * @param updatedData - New items to replace the previous data.
 * @param limit - Optional limit for chunk size when splitting the updated data (only used for InfiniteQueryData).
 * @param addToTotal - Optional total count to add to prev total.
 * @returns - The updated query data formatted in the appropriate structure.
 */
export function formatUpdatedData<T>(
  prevData: InfiniteQueryData<T> | QueryData<T>,
  updatedData: T[],
  limit?: number,
  addToTotal = 0,
): InfiniteQueryData<T> | QueryData<T> {
  if (isQueryData(prevData)) return { total: prevData.total + addToTotal, items: updatedData };

  // return empty InfiniteQueryData for case of deleting all items
  if (!updatedData.length) return { pageParams: [0], pages: [{ items: [], total: 0 }] };

  // Determine the effective limit without modifying the function parameter
  const pageItemsLimit = limit ?? (prevData.pages.length > 1 ? prevData.pages[0].items.length : null);

  // If no effective limit, return all updated data in a single page
  if (!pageItemsLimit) {
    return {
      ...prevData,
      pages: [{ total: prevData.pages[0]?.total ?? 0 + addToTotal, items: updatedData }],
    };
  }
  // InfiniteQueryData, split the updatedData by the limit and update the pages
  const chunks: T[][] = [];
  for (let i = 0; i < updatedData.length; i += pageItemsLimit) {
    chunks.push(updatedData.slice(i, i + pageItemsLimit));
  }

  const oldTotal = prevData.pages[0]?.total ?? 0;

  const totalPages = Math.ceil(updatedData.length / pageItemsLimit);
  const newPages = Array.from({ length: totalPages }, (_, i) => i);

  return {
    ...prevData,
    pageParams: newPages,
    pages: chunks.map((chunk) => ({
      total: oldTotal + addToTotal,
      items: chunk,
    })),
  };
}

export const isQueryData = <T>(data: unknown): data is QueryData<T> => {
  return typeof data === 'object' && data !== null && 'items' in data && 'total' in data;
};

export const isInfiniteQueryData = <T>(data: unknown): data is InfiniteQueryData<T> => {
  return typeof data === 'object' && data !== null && 'pages' in data && 'pageParams' in data;
};

/**
 * Retrieves and cancels any ongoing refetch requests for the given query key(s) to prevent overwriting
 * optimistic updates while the mutation is being processed.
 * @param exactQueryKey - The exact query key to target.
 * @param similarQueryKey - An optional similar query key to also cancel associated refetch requests.
 * @returns - The queries that were canceled.
 */
export const getCancelingRefetchQueries = async <T>(exactQueryKey: QueryKey, similarQueryKey?: QueryKey) => {
  // Snapshot the previous value (queries to work on)
  const queries = getQueries<T>(exactQueryKey, similarQueryKey);

  // Loop through each query and cancel any ongoing refetch requests
  for (const [queryKey] of queries) {
    await queryClient.cancelQueries({ queryKey });
  }

  return queries;
};

/**
 * Retrieves queries based on the exact query key and optionally includes similar queries if provided.
 * @param exactQueryKey - The exact query key to target.
 * @param similarQueryKey - An optional similar query key to retrieve additional queries.
 * @returns - An array of queries.
 */
export const getQueries = <T>(exactQueryKey: QueryKey, similarQueryKey?: QueryKey): [QueryKey, InfiniteQueryData<T> | QueryData<T> | undefined][] => {
  // Get exact queries matching the passed query key
  const exactQuery = getExact<T>(exactQueryKey);

  // If a similar query key is provided, get similar queries and merge with the exact queries
  if (similarQueryKey) {
    const similarQueries = getSimilarQueries<T>(similarQueryKey);
    return [...exactQuery, ...similarQueries];
  }

  return exactQuery;
};

/**
 * Retrieves query data for a given query key.
 *
 * @param passedQueryKey - Query key to search for similar queries.
 * @returns An array with query key and its corresponding data.
 */
const getExact = <T>(passedQueryKey: QueryKey): [QueryKey, InfiniteQueryData<T> | QueryData<T> | undefined][] => {
  return [[passedQueryKey, queryClient.getQueryData<InfiniteQueryData<T> | QueryData<T>>(passedQueryKey)]];
};

/**
 * Retrieves queries similar to the given query key.
 *
 * @param passedQueryKey - Query key to search for similar queries.
 * @returns An array of matching query keys and their corresponding data.
 */
export const getSimilarQueries = <T>(passedQueryKey: QueryKey): [QueryKey, InfiniteQueryData<T> | QueryData<T> | undefined][] => {
  return queryClient.getQueriesData<InfiniteQueryData<T> | QueryData<T>>({ queryKey: passedQueryKey });
};
