import type { QueryKey } from '@tanstack/react-query';
import { queryClient } from '~/lib/router';
import type { InfiniteQueryData, QueryData } from '~/modules/common/query-client-provider/types';

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
 * Formats the updated data by preserving the structure of prev data and inserting new items.
 * Handles both regular query data and infinite query data formats.
 * @param prevData - Previous query data, which can be either QueryData or InfiniteQueryData.
 * @param updatedData - New items to replace the previous data.
 * @returns - The updated query data formatted in the appropriate structure.
 */
export const formatUpdatedData = <T>(prevData: InfiniteQueryData<T> | QueryData<T>, updatedData: T[]) => {
  // QueryData, update it with the new data
  if (isQueryData(prevData)) return { total: updatedData.length, items: updatedData };

  //  InfiniteQueryData, update the pages with the new data
  return { ...prevData, pages: [{ total: updatedData.length, items: updatedData }] };
};

/**
 * Handles the case where there is no previous data, returning an empty structure
 * for either regular or infinite query data.
 * @param previousData- Previous query data, which can be undefined or either QueryData or InfiniteQueryData.
 * @returns - An empty structure for the query data.
 */
export const handleNoOldData = <T>(previousData: QueryData<T> | InfiniteQueryData<T> | undefined) => {
  const pages = { items: [], total: 0 };
  // Return empty structure depending on whether the data is of type QueryData or InfiniteQueryData
  if (isQueryData(previousData)) return pages;
  if (isInfiniteQueryData(previousData)) return { pageParams: [0], pages: [pages] };
};

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
  let queries = exactQuery;

  // If a similar query key is provided, get similar queries and merge with the exact queries
  if (similarQueryKey) {
    const similarQueries = getSimilar<T>(similarQueryKey);
    queries = [...exactQuery, ...similarQueries];
  }

  return queries;
};

// Retrieves query data by a given query key
const getExact = <T>(passedQueryKey: QueryKey): [QueryKey, InfiniteQueryData<T> | QueryData<T> | undefined][] => {
  return [[passedQueryKey, queryClient.getQueryData<InfiniteQueryData<T> | QueryData<T>>(passedQueryKey)]];
};

// Retrieves queries that are similar to given query key
const getSimilar = <T>(passedQueryKey: QueryKey): [QueryKey, InfiniteQueryData<T> | QueryData<T> | undefined][] => {
  return queryClient.getQueriesData<InfiniteQueryData<T> | QueryData<T>>({
    queryKey: passedQueryKey,
  });
};
