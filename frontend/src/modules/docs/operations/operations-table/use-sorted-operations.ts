import { useMemo } from 'react';
import type { SortColumn } from '~/modules/common/data-grid';
import type { GenOperationSummary } from '~/modules/docs/types';

/**
 * Comparable key from an array of strings. Returns `''` for missing/empty so the comparator can
 * pin those rows to the bottom regardless of sort direction.
 */
const arrayKey = (values: string[] | undefined): string => {
  if (!values?.length) return '';
  return [...values].sort().join(',');
};

/**
 * Comparable string for a column key. Dynamic tag (`tag-${kind}`) and extension columns sort by
 * their joined sorted values, so a direction toggle reorders visibly even when every row has one.
 */
const getSortValue = (row: GenOperationSummary, columnKey: string): string => {
  if (columnKey.startsWith('tag-')) return arrayKey(row.tagsByKind?.[columnKey.slice(4)]);
  if (columnKey in row.extensions) return arrayKey(row.extensions[columnKey]);
  return String(row[columnKey as keyof GenOperationSummary] ?? '');
};

/** Client-side sort by the first active sort column (locale-aware string compare).
 * Empty/missing values are always placed last regardless of sort direction. */
export function useSortedOperations(operations: GenOperationSummary[], sortColumns: SortColumn[]) {
  return useMemo(() => {
    if (!sortColumns.length) return operations;
    const { columnKey, direction } = sortColumns[0];
    const modifier = direction === 'ASC' ? 1 : -1;
    return [...operations].sort((a, b) => {
      const aVal = getSortValue(a, columnKey);
      const bVal = getSortValue(b, columnKey);
      // Push empties to the bottom in both ASC and DESC.
      if (!aVal && !bVal) return 0;
      if (!aVal) return 1;
      if (!bVal) return -1;
      return aVal.localeCompare(bVal) * modifier;
    });
  }, [operations, sortColumns]);
}
