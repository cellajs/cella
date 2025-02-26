import isEqual from 'lodash.isequal';
import type { BaseTableProps } from './types';

export const tablePropsAreEqual = <T, U extends { q?: unknown; sort?: unknown; order?: unknown }>(
  prevProps: BaseTableProps<T, U>,
  nextProps: BaseTableProps<T, U>,
) => {
  return (
    isEqual(prevProps.columns, nextProps.columns) &&
    isEqual(prevProps.updateCounts, nextProps.updateCounts) &&
    isEqual(prevProps.queryVars, nextProps.queryVars) &&
    isEqual(prevProps.sortColumns, nextProps.sortColumns)
  );
};
