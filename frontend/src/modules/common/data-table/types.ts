import type { Dispatch, SetStateAction } from 'react';
import type { ColumnOrColumnGroup as GridColumnOrColumnGroup, SortColumn } from 'react-data-grid';

type BaseSearch = { q?: unknown; sort?: unknown; order?: unknown };

export type ColumnOrColumnGroup<TData> = GridColumnOrColumnGroup<TData> & {
  key: string;
  visible?: boolean;
};

export type BaseTableProps<T, K extends BaseSearch> = {
  queryVars: BaseTableQueryVariables<K>;
  columns: ColumnOrColumnGroup<T>[];
  sortColumns: SortColumn[];
  setSortColumns: (sortColumns: SortColumn[]) => void;
  setTotal: (total: number) => void;
  setSelected: (selected: T[]) => void;
};

export type BaseTableMethods = {
  clearSelection: () => void;
};

export type BaseTableQueryVariables<T extends BaseSearch> = {
  q?: T['q'] | undefined;
  sort: T['sort'] | undefined;
  order: T['order'] | undefined;
  limit: number | undefined;
};

export type BaseTableBarProps<T, K> = {
  total: number | undefined;
  selected: T[];
  q: string;
  setSearch: (newValues: Partial<K>, saveSearch?: boolean) => void;
  columns: ColumnOrColumnGroup<T>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<T>[]>>;
};
