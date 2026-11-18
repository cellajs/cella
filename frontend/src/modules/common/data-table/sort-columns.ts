import type { SortColumn } from '~/modules/common/data-grid';

// Method syntax keeps the parameter bivariant: a route's setSearch takes its own `orderBy` values, and its schema reads any other as its default
type SetOrderBy = { setSearch(values: { orderBy?: string }): void }['setSearch'];

/** The grid's sort column from a list's `orderBy` (`'name desc'`, ascending without a direction), and its writer back. */
export const useSortColumns = (orderBy: string | undefined, setSearch: SetOrderBy) => {
  const [columnKey, order = 'asc'] = orderBy?.split(' ') ?? [];
  const sortColumns: SortColumn[] = columnKey ? [{ columnKey, direction: order === 'asc' ? 'ASC' : 'DESC' }] : [];

  const setSortColumns = ([first]: SortColumn[]) =>
    setSearch({ orderBy: first && `${first.columnKey} ${first.direction === 'ASC' ? 'asc' : 'desc'}` });

  return { sortColumns, setSortColumns };
};
