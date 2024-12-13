import type { SortColumn } from 'react-data-grid';

// Get sort and order of column for datatable
export const getSortColumns = (order: 'asc' | 'desc', sort: SortColumn['columnKey']): SortColumn[] => {
  return [{ columnKey: sort, direction: order === 'asc' ? 'ASC' : 'DESC' }];
};
