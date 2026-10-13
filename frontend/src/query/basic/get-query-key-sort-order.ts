import type { QueryKey } from '@tanstack/react-query';

export const getQueryKeySortOrder = (queryKey: QueryKey) => {
  const sortData = queryKey.find(
    (el): el is { sort: string; order?: 'asc' | 'desc' } => typeof el === 'object' && el !== null && 'sort' in el && 'order' in el,
  );

  // Any sort other than createdAt lists newest first.
  const order = sortData?.sort === 'createdAt' ? (sortData.order ?? 'desc') : 'desc';
  return { hasSortData: !!sortData, sort: sortData?.sort, order };
};

/** The order a list takes when its search names none: a hand-arranged `displayOrder` reads ascending, every other column newest or highest first. */
export const defaultOrderFor = (sort: string | undefined): 'asc' | 'desc' => (sort === 'displayOrder' ? 'asc' : 'desc');
