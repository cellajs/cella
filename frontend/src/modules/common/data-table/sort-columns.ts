import type { FullSearchSchema, RegisteredRouter } from '@tanstack/react-router';
import type { SortColumn as BaseSortColumn } from 'react-data-grid';

export type SortColumn = BaseSortColumn & {
  columnKey: FullSearchSchema<RegisteredRouter['routeTree']>['sort'];
};

// Initial sort of columns for tables
export const getInitialSortColumns = (
  search: FullSearchSchema<RegisteredRouter['routeTree']>,
  defaultKey: SortColumn['columnKey'] = 'createdAt',
): SortColumn[] => {
  return search.sort && search.order
    ? [{ columnKey: search.sort, direction: search.order === 'asc' ? 'ASC' : 'DESC' }]
    : [{ columnKey: defaultKey, direction: 'DESC' }];
};
