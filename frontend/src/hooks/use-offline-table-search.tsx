import { useSearch } from '@tanstack/react-router';
import type { RegisteredRouter, UseSearchResult } from '@tanstack/router-core';
import { useEffect } from 'react';
import { useOnlineManager } from '~/hooks/use-online-manager';

type OfflineTableSearchParams<T> = {
  data?: T[];
  filterFn: (searchParams: UseSearchResult<RegisteredRouter, undefined, false, unknown>, item: T) => boolean;
  onFilterCallback?: (filteredData: T[]) => void;
};

// TODO(refactor): after table lazy load logic change review data undefined case(Now DataTable skeleton shown by data undefined due to lazy load)
function useOfflineTableSearch<T>({ data, filterFn, onFilterCallback }: OfflineTableSearchParams<T>): T[] | undefined {
  const searchParams = useSearch({ strict: false });
  const { isOnline } = useOnlineManager();

  // Memoized filtering logic
  const filteredData = !data ? undefined : isOnline ? data : data.filter((item) => filterFn(searchParams, item));

  useEffect(() => {
    if (isOnline || !onFilterCallback || !filteredData) return;
    onFilterCallback(filteredData);
  }, [isOnline, filteredData]);

  return filteredData;
}

export default useOfflineTableSearch;
