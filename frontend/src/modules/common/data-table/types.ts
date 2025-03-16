import type { Dispatch, SetStateAction } from 'react';
import type { ColumnOrColumnGroup as GridColumnOrColumnGroup, SortColumn } from 'react-data-grid';

export type BaseTableSearchVariables<T> = T & {
  limit: number;
};

export type ColumnOrColumnGroup<TData> = GridColumnOrColumnGroup<TData> & {
  key: string;
  visible?: boolean;
};

export type BaseTableProps<T, K> = {
  searchVars: BaseTableSearchVariables<K>;
  columns: ColumnOrColumnGroup<T>[];
  sortColumns: SortColumn[];
  setSortColumns: (sortColumns: SortColumn[]) => void;
  setTotal: (total: number) => void;
  setSelected: (selected: T[]) => void;
};

export type BaseTableMethods = {
  clearSelection: () => void;
};

export type BaseTableBarProps<T, K> = {
  total: number | undefined;
  selected: T[];
  searchVars: BaseTableSearchVariables<K>;
  setSearch: (newValues: Partial<K>, saveSearch?: boolean) => void;
  columns: ColumnOrColumnGroup<T>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<T>[]>>;
};
