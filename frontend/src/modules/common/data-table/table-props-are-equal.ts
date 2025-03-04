import equal from 'fast-deep-equal/es6/react';
import type { BaseTableProps } from './types';

export const tablePropsAreEqual = <T, U extends { q?: unknown; sort?: unknown; order?: unknown }>(
  prevProps: BaseTableProps<T, U>,
  nextProps: BaseTableProps<T, U>,
) => {
  return (
    equal(prevProps.columns, nextProps.columns) &&
    equal(prevProps.updateCounts, nextProps.updateCounts) &&
    equal(prevProps.queryVars, nextProps.queryVars) &&
    equal(prevProps.sortColumns, nextProps.sortColumns)
  );
};
