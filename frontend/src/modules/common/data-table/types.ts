import type { QueryKey } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';
import type { ColumnOrColumnGroup as GridColumnOrColumnGroup, SortColumn } from 'react-data-grid';

export type BaseTableSearchVariables<T> = T & {
  limit: number;
};

export type ColumnOrColumnGroup<TData> = GridColumnOrColumnGroup<TData> & {
  key: string;
  visible?: boolean;
};

export type BaseTableProps<T, K, S> = {
  searchVars: BaseTableSearchVariables<K>;
  queryOptions: S;
  columns: ColumnOrColumnGroup<T>[];
  sortColumns: SortColumn[];
  setSortColumns: (sortColumns: SortColumn[]) => void;
  setSelected: (selected: T[]) => void;
};

export type BaseTableMethods = {
  clearSelection: () => void;
};

export type BaseTableBarProps<T, K> = {
  selected: T[];
  queryKey: QueryKey;
  searchVars: BaseTableSearchVariables<K>;
  setSearch: (newValues: Partial<K>, saveSearch?: boolean) => void;
  columns: ColumnOrColumnGroup<T>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<T>[]>>;
};

/**
 * Generic pattern for callbacks to pass to parent components.
 */
export type CallbackArgs<T> = { status: 'success'; data: T } | { status: 'fail'; error?: string } | { status: 'settle' };
