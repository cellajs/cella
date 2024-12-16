import type { SortColumn } from 'react-data-grid';

type Sort = SortColumn['columnKey'];
type Order = 'asc' | 'desc';

// Get sort and order of column for datatable
// biome-ignore lint/suspicious/noExplicitAny: <explanation>
type SetSearch = (newValues: any) => void;

export const useSortColumns = (sort: Sort | undefined, order: Order | undefined, setSearch: SetSearch) => {
  // If sort and order are defined, set sortColumns
  let sortColumns: SortColumn[] = [];
  if (sort && order) sortColumns = [{ columnKey: sort, direction: order === 'asc' ? 'ASC' : 'DESC' }];

  // Use setSearch to set sort and order in URL
  const setSortColumns = (newSortColumns: SortColumn[]) => {
    if (newSortColumns.length === 0) return setSearch({ sort: undefined, order: undefined });
    setSearch({
      sort: newSortColumns[0].columnKey,
      order: newSortColumns[0].direction === 'ASC' ? 'asc' : 'desc',
    });
  };

  return { sortColumns, setSortColumns };
};
