import type { QueryKey } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';
import type { ColumnOrColumnGroup as GridColumnOrColumnGroup } from 'react-data-grid';
import { ApiError } from '~/api.gen';

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
  columns: ColumnOrColumnGroup<T>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<T>[]>>;
  clearSelection: () => void;
  searchVars: BaseTableSearchVariables<K>;
  setSearch: (newValues: Partial<K>, saveSearch?: boolean) => void;
};

/**
 * Generic pattern for callbacks to pass to parent components.
 */
export type CallbackArgs<T = void> =
  | (T extends void ? { status: 'success' } : { status: 'success'; data: T })
  | { status: 'fail'; error?: ApiError | Error }
  | { status: 'settle' };
