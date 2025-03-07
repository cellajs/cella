import equal from 'fast-deep-equal/es6/react';
import type { BaseTableProps } from '~/modules/common/data-table/types';

export const tablePropsAreEqual = <T, U extends { q?: unknown; sort?: unknown; order?: unknown }>(
  prevProps: BaseTableProps<T, U>,
  nextProps: BaseTableProps<T, U>,
) => {
  return (
    equal(prevProps.columns, nextProps.columns) &&
    equal(prevProps.queryVars, nextProps.queryVars) &&
    equal(prevProps.sortColumns, nextProps.sortColumns)
  );
};
