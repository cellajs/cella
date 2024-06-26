import { type Dispatch, type SetStateAction, useEffect } from 'react';

interface QueryResult<T> {
  data?: {
    pages?: {
      items: T[];
    }[];
  };
}

interface UseQueryResultEffectProps<T> {
  queryResult: QueryResult<T>;
  selectedRows: Set<string>;
  setSelectedRows: (selectedRows: Set<string>) => void;
  setRows: Dispatch<SetStateAction<T[]>>;
}

const useMapQueryDataToRows = <T extends { id: string } & object>({
  queryResult,
  selectedRows,
  setSelectedRows,
  setRows,
}: UseQueryResultEffectProps<T>) => {
  useEffect(() => {
    const data = queryResult.data?.pages?.flatMap((page) => page.items);

    if (data) {
      setSelectedRows(new Set<string>([...selectedRows].filter((id) => data.some((row) => row.id === id))));
      // Reverse the data to remove duplicates from the end because created data is added to the start
      const reversedData = [...data].reverse();
      const newRows = data.filter((row, index) => reversedData.findIndex((r) => r.id === row.id) === reversedData.length - 1 - index);
      setRows(newRows);
    }
  }, [queryResult.data]);
};

export default useMapQueryDataToRows;
