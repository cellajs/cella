import type { QueryKey } from '@tanstack/react-query';

/**
 * Gets the sort order from a query key.
 *
 * @param queryKey - The query key to extract sort order from.
 * @returns An object containing whether sort data exists, the sort field, and the order ('asc' or 'desc').
 */
export const getQueryKeySortOrder = (queryKey: QueryKey) => {
  // Find the object in queryKey that contains 'sort' and 'order' properties
  const sortData = queryKey.find(
    (el): el is { sort: string; order?: 'asc' | 'desc' } =>
      typeof el === 'object' && el !== null && 'sort' in el && 'order' in el,
  );

  // If sorted by 'createdAt', return its order, otherwise 'desc'(at the top of list)
  return {
    hasSortData: !!sortData,
    sort: sortData?.sort,
    order: sortData?.sort === 'createdAt' ? (sortData.order ?? 'desc') : 'desc',
  };
};
