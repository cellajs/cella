import type { QueryKey } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';
import type { ColumnOrColumnGroup as GridColumnOrColumnGroup } from 'react-data-grid';

export type BaseTableSearchVariables<T> = T & {
  limit: number;
};

export type ColumnOrColumnGroup<TData> = GridColumnOrColumnGroup<TData> & {
  key: string;
  visible?: boolean;
};

export type BaseTableBarProps<T, K> = {
  selected: T[];
  queryKey: QueryKey;
  searchVars: BaseTableSearchVariables<K>;
  setSearch: (newValues: Partial<K>, saveSearch?: boolean) => void;
  columns: ColumnOrColumnGroup<T>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<T>[]>>;
  clearSelection: () => void;
};

/**
 * Generic pattern for callbacks to pass to parent components.
 */
export type CallbackArgs<T> = { status: 'success'; data: T } | { status: 'fail'; error?: string } | { status: 'settle' };
