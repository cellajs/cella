import { useCallback } from 'react';

import type { CalculatedColumn, Position } from '../types';

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

export interface CopyPasteOptions<R, SR> {
  /** Current selected cell position */
  selectedPosition: Position;
  /** Grid rows */
  rows: readonly R[];
  /** Grid columns */
  columns: readonly CalculatedColumn<R, SR>[];
  /** Callback when cells are copied - return false to prevent default copy behavior */
  onCopy?: (args: CopyCallbackArgs<R, SR>) => boolean | void;
  /** Callback when content is pasted - return the new row or undefined to prevent paste */
  onPaste?: (args: PasteCallbackArgs<R, SR>) => R | undefined;
  /** Function to update a row */
  onRowChange?: (rowIdx: number, row: R) => void;
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
 * Hook to handle copy/paste operations in the data grid
 * Supports both keyboard shortcuts (Ctrl/Cmd+C/V) and programmatic access
 */
export function useCopyPaste<R, SR>({
  selectedPosition,
  rows,
  columns,
  onCopy,
  onPaste,
  onRowChange,
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
      const cell = getSelectedCell();
      if (!cell) return;

      const { column, row, rowIdx } = cell;

      // Get the cell value
      const value = row[column.key as keyof R];
      const textValue = value != null ? String(value) : '';

      // Call user callback
      const shouldPreventDefault = onCopy?.({ row, column, rowIdx, value });

      // If callback returns false, don't copy
      if (shouldPreventDefault === false) return;

      // Write to clipboard
      event.clipboardData.setData('text/plain', textValue);
      event.preventDefault();
    },
    [getSelectedCell, onCopy],
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      const cell = getSelectedCell();
      if (!cell || !onRowChange) return;

      const { column, row, rowIdx } = cell;
      const pastedText = event.clipboardData.getData('text/plain');

      // Call user callback to get the new row
      const newRow = onPaste?.({ row, column, rowIdx, pastedValue: pastedText });

      // If callback returns undefined, don't paste
      if (newRow === undefined) return;

      // If row changed, update it
      if (newRow !== row) {
        onRowChange(rowIdx, newRow);
        event.preventDefault();
      }
    },
    [getSelectedCell, onPaste, onRowChange],
  );

  const copyToClipboard = useCallback(async () => {
    const cell = getSelectedCell();
    if (!cell) return;

    const { column, row, rowIdx } = cell;
    const value = row[column.key as keyof R];
    const textValue = value != null ? String(value) : '';

    // Call user callback
    const shouldPreventDefault = onCopy?.({ row, column, rowIdx, value });
    if (shouldPreventDefault === false) return;

    try {
      await navigator.clipboard.writeText(textValue);
    } catch (error) {
      console.debug('[useCopyPaste] Failed to copy to clipboard:', error);
    }
  }, [getSelectedCell, onCopy]);

  const pasteFromClipboard = useCallback(async () => {
    const cell = getSelectedCell();
    if (!cell || !onRowChange) return;

    const { column, row, rowIdx } = cell;

    try {
      const pastedText = await navigator.clipboard.readText();

      // Call user callback to get the new row
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
