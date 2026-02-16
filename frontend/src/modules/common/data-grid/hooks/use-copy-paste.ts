import { useCallback } from 'react';

import type { CalculatedColumn, CellRange, Position } from '../types';
import { getCellsInRange, normalizeCellRange } from '../utils/cell-range-utils';
import { parseTSVToCells, serializeCellsToHTML, serializeCellsToTSV } from '../utils/clipboard-utils';

export interface CopyPasteCallbackArgs<R, SR> {
  row: R;
  column: CalculatedColumn<R, SR>;
  rowIdx: number;
}

export interface CopyCallbackArgs<R, SR> extends CopyPasteCallbackArgs<R, SR> {
  value: unknown;
}

export interface PasteCallbackArgs<R, SR> extends CopyPasteCallbackArgs<R, SR> {
  pastedValue: string;
}

/** Args passed to onCopyRange callback */
export interface CopyRangeArgs<R, SR> {
  range: CellRange;
  cells: Array<{ row: R; column: CalculatedColumn<R, SR>; rowIdx: number; colIdx: number }>;
  textValue: string;
}

/** Args passed to onPasteRange callback */
export interface PasteRangeArgs<R, SR> {
  startPosition: Position;
  values: string[][];
  affectedCells: Array<{ row: R; column: CalculatedColumn<R, SR>; rowIdx: number; colIdx: number; value: string }>;
}

export interface CopyPasteOptions<R, SR> {
  /** Current selected cell position */
  selectedPosition: Position;
  /** Current cell range selection (for multi-cell operations) */
  selectedCellRange?: CellRange | null;
  /** Grid rows */
  rows: readonly R[];
  /** Grid columns */
  columns: readonly CalculatedColumn<R, SR>[];
  /** Callback when single cell is copied - return false to prevent default copy behavior */
  onCopy?: (args: CopyCallbackArgs<R, SR>) => boolean | void;
  /** Callback when content is pasted into single cell - return the new row or undefined to prevent paste */
  onPaste?: (args: PasteCallbackArgs<R, SR>) => R | undefined;
  /** Callback when cell range is copied - return false to prevent default */
  onCopyRange?: (args: CopyRangeArgs<R, SR>) => boolean | void;
  /** Callback when content is pasted into range - return updated rows or undefined to prevent */
  onPasteRange?: (args: PasteRangeArgs<R, SR>) => R[] | undefined;
  /** Function to update a single row */
  onRowChange?: (rowIdx: number, row: R) => void;
  /** Function to update multiple rows in batch */
  onRowsChange?: (updates: Array<{ rowIdx: number; row: R }>) => void;
}

export interface CopyPasteResult {
  /** Handle copy event on the grid */
  handleCopy: (event: React.ClipboardEvent) => void;
  /** Handle paste event on the grid */
  handlePaste: (event: React.ClipboardEvent) => void;
  /** Programmatically copy selected cells to clipboard */
  copyToClipboard: () => Promise<void>;
  /** Programmatically paste from clipboard to selected cells */
  pasteFromClipboard: () => Promise<void>;
}

/**
 * Hook to handle copy/paste operations in the data grid.
 * Supports single cell and multi-cell range operations with TSV format.
 */
export function useCopyPaste<R, SR>({
  selectedPosition,
  selectedCellRange,
  rows,
  columns,
  onCopy,
  onPaste,
  onCopyRange,
  onPasteRange,
  onRowChange,
  onRowsChange,
}: CopyPasteOptions<R, SR>): CopyPasteResult {
  const getSelectedCell = useCallback(() => {
    const { idx, rowIdx } = selectedPosition;
    if (rowIdx < 0 || rowIdx >= rows.length || idx < 0 || idx >= columns.length) {
      return null;
    }
    return {
      column: columns[idx],
      row: rows[rowIdx],
      rowIdx,
    };
  }, [selectedPosition, rows, columns]);

  const handleCopy = useCallback(
    (event: React.ClipboardEvent) => {
      // Check for range selection first
      if (selectedCellRange) {
        const normalized = normalizeCellRange(selectedCellRange);
        const cells = getCellsInRange(normalized, rows, columns);

        if (cells.length === 0) return;

        const textValue = serializeCellsToTSV(normalized, rows, columns);
        const htmlValue = serializeCellsToHTML(normalized, rows, columns);

        // Call user callback
        const shouldPreventDefault = onCopyRange?.({ range: normalized, cells, textValue });
        if (shouldPreventDefault === false) return;

        // Write both formats to clipboard
        event.clipboardData.setData('text/plain', textValue);
        event.clipboardData.setData('text/html', htmlValue);
        event.preventDefault();
        return;
      }

      // Single cell copy
      const cell = getSelectedCell();
      if (!cell) return;

      const { column, row, rowIdx } = cell;
      const value = row[column.key as keyof R];
      const textValue = value != null ? String(value) : '';

      const shouldPreventDefault = onCopy?.({ row, column, rowIdx, value });
      if (shouldPreventDefault === false) return;

      event.clipboardData.setData('text/plain', textValue);
      event.preventDefault();
    },
    [getSelectedCell, onCopy, onCopyRange, selectedCellRange, rows, columns],
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      const pastedText = event.clipboardData.getData('text/plain');
      const parsedCells = parseTSVToCells(pastedText);

      // Determine if this is a multi-cell paste
      const isMultiCellPaste = parsedCells.length > 1 || (parsedCells.length === 1 && parsedCells[0].length > 1);

      if (isMultiCellPaste && onPasteRange) {
        // Multi-cell paste
        const { idx, rowIdx } = selectedPosition;
        if (rowIdx < 0 || idx < 0) return;

        // Build affected cells list
        const affectedCells: Array<{
          row: R;
          column: CalculatedColumn<R, SR>;
          rowIdx: number;
          colIdx: number;
          value: string;
        }> = [];

        for (let r = 0; r < parsedCells.length; r++) {
          const targetRowIdx = rowIdx + r;
          if (targetRowIdx >= rows.length) break;

          for (let c = 0; c < parsedCells[r].length; c++) {
            const targetColIdx = idx + c;
            if (targetColIdx >= columns.length) break;

            affectedCells.push({
              row: rows[targetRowIdx],
              column: columns[targetColIdx],
              rowIdx: targetRowIdx,
              colIdx: targetColIdx,
              value: parsedCells[r][c],
            });
          }
        }

        const updatedRows = onPasteRange({
          startPosition: { idx, rowIdx },
          values: parsedCells,
          affectedCells,
        });

        if (updatedRows && onRowsChange) {
          const updates = updatedRows.map((row, i) => ({
            rowIdx: rowIdx + Math.floor(i / parsedCells[0].length),
            row,
          }));
          onRowsChange(updates);
          event.preventDefault();
        }
        return;
      }

      // Single cell paste
      const cell = getSelectedCell();
      if (!cell || !onRowChange) return;

      const { column, row, rowIdx } = cell;
      const newRow = onPaste?.({ row, column, rowIdx, pastedValue: pastedText });

      if (newRow !== undefined && newRow !== row) {
        onRowChange(rowIdx, newRow);
        event.preventDefault();
      }
    },
    [getSelectedCell, onPaste, onPasteRange, onRowChange, onRowsChange, selectedPosition, rows, columns],
  );

  const copyToClipboard = useCallback(async () => {
    // Check for range selection first
    if (selectedCellRange) {
      const normalized = normalizeCellRange(selectedCellRange);
      const cells = getCellsInRange(normalized, rows, columns);

      if (cells.length === 0) return;

      const textValue = serializeCellsToTSV(normalized, rows, columns);
      const shouldPreventDefault = onCopyRange?.({ range: normalized, cells, textValue });
      if (shouldPreventDefault === false) return;

      try {
        await navigator.clipboard.writeText(textValue);
      } catch (error) {
        console.debug('[useCopyPaste] Failed to copy range to clipboard:', error);
      }
      return;
    }

    // Single cell copy
    const cell = getSelectedCell();
    if (!cell) return;

    const { column, row, rowIdx } = cell;
    const value = row[column.key as keyof R];
    const textValue = value != null ? String(value) : '';

    const shouldPreventDefault = onCopy?.({ row, column, rowIdx, value });
    if (shouldPreventDefault === false) return;

    try {
      await navigator.clipboard.writeText(textValue);
    } catch (error) {
      console.debug('[useCopyPaste] Failed to copy to clipboard:', error);
    }
  }, [getSelectedCell, onCopy, onCopyRange, selectedCellRange, rows, columns]);

  const pasteFromClipboard = useCallback(async () => {
    const cell = getSelectedCell();
    if (!cell || !onRowChange) return;

    const { column, row, rowIdx } = cell;

    try {
      const pastedText = await navigator.clipboard.readText();
      const newRow = onPaste?.({ row, column, rowIdx, pastedValue: pastedText });

      if (newRow !== undefined && newRow !== row) {
        onRowChange(rowIdx, newRow);
      }
    } catch (error) {
      console.debug('[useCopyPaste] Failed to paste from clipboard:', error);
    }
  }, [getSelectedCell, onPaste, onRowChange]);

  return {
    handleCopy,
    handlePaste,
    copyToClipboard,
    pasteFromClipboard,
  };
}
