import { type InfiniteData, type QueryKey, useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

interface TQueryFnData<T> {
  items: T[];
  total: number;
}

type OptionsCallback<T, TQueryKey extends QueryKey = QueryKey> = (params: { rowsLength: number }) => Parameters<
  typeof useSuspenseInfiniteQuery<T, Error, InfiniteData<T, unknown>, TQueryKey, number>
>[0];

// Custom hook to map query result data to rows
export const useDataFromSuspenseInfiniteQuery = <T extends { id: string } = { id: string }, TQueryKey extends QueryKey = QueryKey>(
  optionsCallback: OptionsCallback<TQueryFnData<T>, TQueryKey>,
) => {
  const [rows, setRows] = useState<T[]>([]);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [totalCount, setTotalCount] = useState(0);

  const queryResult = useSuspenseInfiniteQuery(
    optionsCallback({
      rowsLength: rows.length,
    }),
  );

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
