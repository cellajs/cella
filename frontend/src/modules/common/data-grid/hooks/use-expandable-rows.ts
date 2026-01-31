import { useCallback, useMemo, useState } from 'react';

export interface ExpandableRowOptions<R> {
  /** Function to get a unique key for each row */
  getRowKey: (row: R) => string | number;
  /** Initially expanded row keys */
  defaultExpandedRowKeys?: Set<string | number>;
  /** Controlled expanded row keys */
  expandedRowKeys?: Set<string | number>;
  /** Callback when expanded rows change */
  onExpandedRowKeysChange?: (keys: Set<string | number>) => void;
}

export interface ExpandableRowResult<R> {
  /** Set of currently expanded row keys */
  expandedRowKeys: Set<string | number>;
  /** Check if a specific row is expanded */
  isRowExpanded: (row: R) => boolean;
  /** Toggle the expansion state of a row */
  toggleRowExpanded: (row: R) => void;
  /** Expand a specific row */
  expandRow: (row: R) => void;
  /** Collapse a specific row */
  collapseRow: (row: R) => void;
  /** Expand all rows */
  expandAll: (rows: readonly R[]) => void;
  /** Collapse all rows */
  collapseAll: () => void;
}

/**
 * Hook to manage expandable row state for mobile-friendly sub-row views
 * Supports both controlled and uncontrolled modes
 */
export function useExpandableRows<R>({
  getRowKey,
  defaultExpandedRowKeys,
  expandedRowKeys: controlledExpandedKeys,
  onExpandedRowKeysChange,
}: ExpandableRowOptions<R>): ExpandableRowResult<R> {
  const [internalExpandedKeys, setInternalExpandedKeys] = useState<Set<string | number>>(
    () => defaultExpandedRowKeys ?? new Set(),
  );

  const isControlled = controlledExpandedKeys !== undefined;
  const expandedRowKeys = isControlled ? controlledExpandedKeys : internalExpandedKeys;

  const updateExpandedKeys = useCallback(
    (keys: Set<string | number>) => {
      if (!isControlled) {
        setInternalExpandedKeys(keys);
      }
      onExpandedRowKeysChange?.(keys);
    },
    [isControlled, onExpandedRowKeysChange],
  );

  const isRowExpanded = useCallback(
    (row: R): boolean => {
      const key = getRowKey(row);
      return expandedRowKeys.has(key);
    },
    [expandedRowKeys, getRowKey],
  );

  const toggleRowExpanded = useCallback(
    (row: R) => {
      const key = getRowKey(row);
      const newKeys = new Set(expandedRowKeys);
      if (newKeys.has(key)) {
        newKeys.delete(key);
      } else {
        newKeys.add(key);
      }
      updateExpandedKeys(newKeys);
    },
    [expandedRowKeys, getRowKey, updateExpandedKeys],
  );

  const expandRow = useCallback(
    (row: R) => {
      const key = getRowKey(row);
      if (!expandedRowKeys.has(key)) {
        const newKeys = new Set(expandedRowKeys);
        newKeys.add(key);
        updateExpandedKeys(newKeys);
      }
    },
    [expandedRowKeys, getRowKey, updateExpandedKeys],
  );

  const collapseRow = useCallback(
    (row: R) => {
      const key = getRowKey(row);
      if (expandedRowKeys.has(key)) {
        const newKeys = new Set(expandedRowKeys);
        newKeys.delete(key);
        updateExpandedKeys(newKeys);
      }
    },
    [expandedRowKeys, getRowKey, updateExpandedKeys],
  );

  const expandAll = useCallback(
    (rows: readonly R[]) => {
      const newKeys = new Set<string | number>();
      for (const row of rows) {
        newKeys.add(getRowKey(row));
      }
      updateExpandedKeys(newKeys);
    },
    [getRowKey, updateExpandedKeys],
  );

  const collapseAll = useCallback(() => {
    updateExpandedKeys(new Set());
  }, [updateExpandedKeys]);

  return useMemo(
    () => ({
      expandedRowKeys,
      isRowExpanded,
      toggleRowExpanded,
      expandRow,
      collapseRow,
      expandAll,
      collapseAll,
    }),
    [expandedRowKeys, isRowExpanded, toggleRowExpanded, expandRow, collapseRow, expandAll, collapseAll],
  );
}
