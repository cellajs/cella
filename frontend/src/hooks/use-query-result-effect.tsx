import { useEffect } from 'react';

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
  setRows: (rows: T[]) => void;
}

const useQueryResultEffect = <T extends { id: string } & object>({
  queryResult,
  selectedRows,
  setSelectedRows,
  setRows,
}: UseQueryResultEffectProps<T>) => {
  useEffect(() => {
    const data = queryResult.data?.pages?.flatMap((page) => page.items);

    if (data) {
      setSelectedRows(new Set<string>([...selectedRows].filter((id) => data.some((row) => row.id === id))));
      setRows(data);
    }
  }, [queryResult.data, selectedRows, setSelectedRows, setRows]);
};

export default useQueryResultEffect;
