import type { SortColumn } from '~/modules/common/data-grid';

// biome-ignore lint/suspicious/noExplicitAny: unable to infer type due to dynamic data structure
type SetSearch = (newValues: any) => void;

export const useSortColumns = (sort: SortColumn['columnKey'] | undefined, order: 'asc' | 'desc' | undefined, setSearch: SetSearch) => {
  const sortColumns: SortColumn[] = sort && order ? [{ columnKey: sort, direction: order === 'asc' ? 'ASC' : 'DESC' }] : [];

  const setSortColumns = (newSortColumns: SortColumn[]) => {
    if (newSortColumns.length === 0) return setSearch({ sort: undefined, order: undefined });
    setSearch({ sort: newSortColumns[0].columnKey, order: newSortColumns[0].direction === 'ASC' ? 'asc' : 'desc' });
  };

  return { sortColumns, setSortColumns };
};
