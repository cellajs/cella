import type { QueryKey } from '@tanstack/react-query';

export const getQueryKeySortOrder = (queryKey: QueryKey) => {
  const sortData = queryKey.find(
    (el): el is { sort: string; order?: 'asc' | 'desc' } =>
      typeof el === 'object' && el !== null && 'sort' in el && 'order' in el,
  );

  // Any sort other than createdAt lists newest first.
  return {
    hasSortData: !!sortData,
    sort: sortData?.sort,
    order: sortData?.sort === 'createdAt' ? (sortData.order ?? 'desc') : 'desc',
  };
};
