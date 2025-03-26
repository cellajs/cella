import { type RegisteredRouter, useSearch } from '@tanstack/react-router';
import type { UseSearchResult } from '@tanstack/router-core';
import { useEffect, useMemo } from 'react';
import { useOnlineManager } from '~/hooks/use-online-manager';

type OfflineTableSearchParams<T> = {
  data: T[];
  filterFn: (searchParams: UseSearchResult<RegisteredRouter, undefined, false, unknown>, item: T) => boolean;
  onFilterCallback?: (filteredData: T[]) => void;
};

function useOfflineTableSearch<T>({ data, filterFn, onFilterCallback }: OfflineTableSearchParams<T>): T[] {
  const searchParams = useSearch({ strict: false });
  const { isOnline } = useOnlineManager();

  // Memoized filtering logic
  const filteredData = useMemo(() => (isOnline ? data : data.filter((item) => filterFn(searchParams, item))), [data, searchParams, isOnline]);

  useEffect(() => {
    if (isOnline || !onFilterCallback) return;
    onFilterCallback(filteredData);
  }, [isOnline, filteredData]);

  return filteredData;
}

export default useOfflineTableSearch;
