import type { SortColumn } from 'react-data-grid';

// Initial sort of columns for tables
// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export const getInitialSortColumns = (search: any): SortColumn[] => {
  return search.sort && search.order
    ? [{ columnKey: search.sort, direction: search.order === 'asc' ? 'ASC' : 'DESC' }]
    : [{ columnKey: 'createdAt', direction: 'DESC' }];
};
