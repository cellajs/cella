import type { QueryKey } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';
import type { ApiError } from 'sdk';
import type { ColumnOrColumnGroup as GridColumnOrColumnGroup } from '~/modules/common/data-grid';

export type BaseTableSearchVariables<T> = T & {
  limit: number;
};

/** Grid columns narrowed to keyed entries for table chrome; the grid filters hidden entries. */
export type ColumnOrColumnGroup<TData> = GridColumnOrColumnGroup<TData> & {
  key: string;
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
