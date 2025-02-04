import type { Dispatch, SetStateAction } from 'react';
import type { ColumnOrColumnGroup as GridColumnOrColumnGroup, SortColumn } from 'react-data-grid';

export type ColumnOrColumnGroup<TData> = GridColumnOrColumnGroup<TData> & {
  key: string;
  visible?: boolean;
};

export type BaseTableProps<T, K extends { q?: unknown; sort?: unknown; order?: unknown }> = {
  queryVars: BaseTableQueryVariables<K>;
  columns: ColumnOrColumnGroup<T>[];
  sortColumns: SortColumn[];
  setSortColumns: (sortColumns: SortColumn[]) => void;
  updateCounts: (selected: T[], total: number) => void;
};

export type BaseTableMethods = {
  clearSelection: () => void;
};

export type BaseTableQueryVariables<T extends { q?: unknown; sort?: unknown; order?: unknown }> = {
  q: T['q'] | undefined;
  sort: T['sort'] | undefined;
  order: T['order'] | undefined;
  limit: number | undefined;
};

export type BaseTableHeaderProps<T, K> = {
  total: number | undefined;
  selected: T[];
  q: string;
  setSearch: (newValues: Partial<K>, saveSearch?: boolean) => void;
  columns: ColumnOrColumnGroup<T>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<T>[]>>;
};
