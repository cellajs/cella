import type { QueryKey } from '@tanstack/react-query';

/** The order new rows enter a paged list in: the createdAt order its key names, else newest first. */
export function getQueryKeySortOrder(queryKey: QueryKey): 'asc' | 'desc' {
  const sortData = queryKey.find(
    (segment): segment is { sort: string; order?: 'asc' | 'desc' } =>
      typeof segment === 'object' && segment !== null && 'sort' in segment && 'order' in segment,
  );
  return sortData?.sort === 'createdAt' ? (sortData.order ?? 'desc') : 'desc';
}
