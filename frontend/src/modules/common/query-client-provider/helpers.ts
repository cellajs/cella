import type { InfiniteQueryData, QueryData } from './types';

export const getQueryItems = <T>(prevItems: QueryData<T> | InfiniteQueryData<T>) => {
  return isQueryData(prevItems) ? prevItems.items : prevItems.pages.flatMap((page) => page.items);
};

export const formatUpdatedData = <T>(oldData: InfiniteQueryData<T> | QueryData<T>, updatedData: T[]) => {
  if (isQueryData(oldData)) return { total: updatedData.length, items: updatedData };

  return { ...oldData, pages: [{ total: updatedData.length, items: updatedData }] };
};

export const handleNoOldData = <T>(previousTasks: QueryData<T> | InfiniteQueryData<T> | undefined) => {
  const pages = {
    items: [],
    total: 0,
  };
  if (isQueryData(previousTasks)) return pages;
  if (isInfiniteQueryData(previousTasks)) return { pageParams: [0], pages: [pages] };
};

//determine if the data is QueryData
export const isQueryData = <T>(data: unknown): data is QueryData<T> => {
  return typeof data === 'object' && data !== null && 'items' in data && 'total' in data;
};

// determine if the data is InfiniteQueryData
export const isInfiniteQueryData = <T>(data: unknown): data is InfiniteQueryData<T> => {
  return typeof data === 'object' && data !== null && 'pages' in data && 'pageParams' in data;
};
