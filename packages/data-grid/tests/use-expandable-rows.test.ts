import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useExpandableRows } from '../src/hooks/use-expandable-rows';

interface TestRow {
  id: string;
  name: string;
}

const getRowKey = (row: TestRow) => row.id;

describe('useExpandableRows', () => {
  const testRows: TestRow[] = [
    { id: '1', name: 'Row 1' },
    { id: '2', name: 'Row 2' },
    { id: '3', name: 'Row 3' },
  ];

  it('should start with no expanded rows by default', () => {
    const { result } = renderHook(() =>
      useExpandableRows({ getRowKey })
    );

    expect(result.current.expandedRowKeys.size).toBe(0);
    expect(result.current.isRowExpanded(testRows[0])).toBe(false);
  });

  it('should start with default expanded rows', () => {
    const { result } = renderHook(() =>
      useExpandableRows({
        getRowKey,
        defaultExpandedRowKeys: new Set(['1', '2']),
      })
    );

    expect(result.current.expandedRowKeys.size).toBe(2);
    expect(result.current.isRowExpanded(testRows[0])).toBe(true);
    expect(result.current.isRowExpanded(testRows[1])).toBe(true);
    expect(result.current.isRowExpanded(testRows[2])).toBe(false);
  });

  it('should toggle row expansion', () => {
    const { result } = renderHook(() =>
      useExpandableRows({ getRowKey })
    );

    expect(result.current.isRowExpanded(testRows[0])).toBe(false);

    act(() => {
      result.current.toggleRowExpanded(testRows[0]);
    });

    expect(result.current.isRowExpanded(testRows[0])).toBe(true);

    act(() => {
      result.current.toggleRowExpanded(testRows[0]);
    });

    expect(result.current.isRowExpanded(testRows[0])).toBe(false);
  });

  it('should expand a specific row', () => {
    const { result } = renderHook(() =>
      useExpandableRows({ getRowKey })
    );

    act(() => {
      result.current.expandRow(testRows[0]);
    });

    expect(result.current.isRowExpanded(testRows[0])).toBe(true);

    // Calling expand again should be a no-op
    act(() => {
      result.current.expandRow(testRows[0]);
    });

    expect(result.current.isRowExpanded(testRows[0])).toBe(true);
    expect(result.current.expandedRowKeys.size).toBe(1);
  });

  it('should collapse a specific row', () => {
    const { result } = renderHook(() =>
      useExpandableRows({
        getRowKey,
        defaultExpandedRowKeys: new Set(['1']),
      })
    );

    expect(result.current.isRowExpanded(testRows[0])).toBe(true);

    act(() => {
      result.current.collapseRow(testRows[0]);
    });

    expect(result.current.isRowExpanded(testRows[0])).toBe(false);
  });

  it('should expand all rows', () => {
    const { result } = renderHook(() =>
      useExpandableRows({ getRowKey })
    );

    act(() => {
      result.current.expandAll(testRows);
    });

    expect(result.current.expandedRowKeys.size).toBe(3);
    for (const row of testRows) {
      expect(result.current.isRowExpanded(row)).toBe(true);
    }
  });

  it('should collapse all rows', () => {
    const { result } = renderHook(() =>
      useExpandableRows({
        getRowKey,
        defaultExpandedRowKeys: new Set(['1', '2', '3']),
      })
    );

    expect(result.current.expandedRowKeys.size).toBe(3);

    act(() => {
      result.current.collapseAll();
    });

    expect(result.current.expandedRowKeys.size).toBe(0);
  });

  it('should call onExpandedRowKeysChange callback', () => {
    const onExpandedRowKeysChange = vi.fn();
    const { result } = renderHook(() =>
      useExpandableRows({
        getRowKey,
        onExpandedRowKeysChange,
      })
    );

    act(() => {
      result.current.toggleRowExpanded(testRows[0]);
    });

    expect(onExpandedRowKeysChange).toHaveBeenCalledWith(new Set(['1']));
  });

  it('should work in controlled mode', () => {
    const onExpandedRowKeysChange = vi.fn();
    const controlledKeys = new Set(['1']);

    const { result, rerender } = renderHook(
      ({ expandedRowKeys }) =>
        useExpandableRows({
          getRowKey,
          expandedRowKeys,
          onExpandedRowKeysChange,
        }),
      { initialProps: { expandedRowKeys: controlledKeys } }
    );

    expect(result.current.isRowExpanded(testRows[0])).toBe(true);
    expect(result.current.isRowExpanded(testRows[1])).toBe(false);

    // Toggle should call callback but not change internal state in controlled mode
    act(() => {
      result.current.toggleRowExpanded(testRows[1]);
    });

    expect(onExpandedRowKeysChange).toHaveBeenCalled();

    // Rerender with new controlled value
    rerender({ expandedRowKeys: new Set(['1', '2']) });

    expect(result.current.isRowExpanded(testRows[0])).toBe(true);
    expect(result.current.isRowExpanded(testRows[1])).toBe(true);
  });
});
