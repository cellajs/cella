import { useSearch } from '@tanstack/react-router';
import type { RegisteredRouter, UseSearchResult } from '@tanstack/router-core';
import { useEffect } from 'react';
import { useOnlineManager } from '~/hooks/use-online-manager';

type OfflineTableSearchParams<T> = {
  data?: T[];
  filterFn: (searchParams: UseSearchResult<RegisteredRouter, undefined, false, unknown>, item: T) => boolean;
  onFilterCallback?: (filteredData: T[]) => void;
};

/**
 * Hook to filter table data offline based on search params when offline.
 */
export function useOfflineTableSearch<T>({
  data,
  filterFn,
  onFilterCallback,
}: OfflineTableSearchParams<T>): T[] | undefined {
  const searchParams = useSearch({ strict: false });
  const { isOnline } = useOnlineManager();

  const filteredData = !data ? undefined : isOnline ? data : data.filter((item) => filterFn(searchParams, item));

  useEffect(() => {
    if (isOnline || !onFilterCallback || !filteredData) return;
    onFilterCallback(filteredData);
  }, [isOnline, filteredData]);

  return filteredData;
}
