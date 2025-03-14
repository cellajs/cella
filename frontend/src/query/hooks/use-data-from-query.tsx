import { type InfiniteData, type QueryKey, useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { QueryData } from '~/query/types';

type Options<T, TQueryKey extends QueryKey = QueryKey> = Parameters<
  typeof useInfiniteQuery<T, Error, InfiniteData<T, unknown>, TQueryKey, number>
>[0];

/**
 * Custom hook to map query result data to rows for a infinite query.
 *
 * This hook uses a infinite query to fetch and manage paginated data.
 * It flattens the fetched pages into a single list of rows and manages selected rows and total count.
 *
 * @param options - The options object for the query, including the query key and any other parameters for the infinite query.
 *
 * @returns An object containing:
 *  - `rows`: The flattened array of items (rows) from the infinite query.
 *  - `setRows`: A function to manually set the rows.
 *  - `selectedRows`: A set of the selected row IDs.
 *  - `setSelectedRows`: A function to manually update the selected rows.
 *  - `totalCount`: The total count of items based on the query result.
 *  - `queryResult`: The result from the `useInfiniteQuery` hook, providing additional query states such as `isLoading`, `isError`, etc.
 */
export const useDataFromInfiniteQuery = <T extends { id: string } = { id: string }, TQueryKey extends QueryKey = QueryKey>(
  options: Options<QueryData<T>, TQueryKey>,
) => {
  const [rows, setRows] = useState<T[]>([]);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [totalCount, setTotalCount] = useState(0);

  const queryResult = useInfiniteQuery(options);

  useEffect(() => {
    // Flatten the array of pages to get all items
    const data = queryResult.data?.pages?.flatMap((page) => page.items);
    if (!data) return;

    // Update total count
    setTotalCount(queryResult.data?.pages?.[queryResult.data.pages.length - 1]?.total ?? 0);

    // Update selected rows
    if (selectedRows.size > 0) {
      setSelectedRows(new Set<string>([...selectedRows].filter((id) => data.some((row) => row.id === id))));
    }

    setRows(data);
  }, [queryResult.data]);

  return {
    ...queryResult,
    rows,
    setRows,
    selectedRows,
    setSelectedRows,
    totalCount,
  };
};
