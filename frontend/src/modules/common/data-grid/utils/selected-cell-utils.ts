import type { CalculatedColumn, CellNavigationMode, Position } from '../types';

// https://github.com/vercel/next.js/issues/56480
export function isCellEditableUtil<R, SR>(column: CalculatedColumn<R, SR>, row: R): boolean {
  return column.renderEditCell != null && (typeof column.editable === 'function' ? column.editable(row) : column.editable) !== false;
}

interface GetNextSelectedCellPositionOpts<R, SR> {
  moveNext: boolean;
  cellNavigationMode: CellNavigationMode;
  columns: readonly CalculatedColumn<R, SR>[];
  minRowIdx: number;
  maxRowIdx: number;
  currentPosition: Position;
  nextPosition: Position;
}

function findNextFocusableColumn<R, SR>(columns: readonly CalculatedColumn<R, SR>[], startIdx: number, direction: 1 | -1): number {
  let idx = startIdx;
  const maxIdx = columns.length - 1;

  while (idx >= 0 && idx <= maxIdx) {
    const column = columns[idx];
    if (column.focusable !== false) return idx;
    idx += direction;
  }

  return direction === 1 ? maxIdx + 1 : -1;
}

export function getNextSelectedCellPosition<R, SR>({
  moveNext,
  cellNavigationMode,
  columns,
  minRowIdx,
  maxRowIdx,
  currentPosition: { idx: currentIdx },
  nextPosition,
}: GetNextSelectedCellPositionOpts<R, SR>): Position {
  let { idx: nextIdx, rowIdx: nextRowIdx } = nextPosition;
  const columnsCount = columns.length;

  // Skip non-focusable columns when navigating horizontally
  if (nextIdx >= 0 && nextIdx < columnsCount && nextRowIdx >= 0) {
    const column = columns[nextIdx];
    if (column.focusable === false) {
      const direction = moveNext ? 1 : -1;
      const focusableIdx = findNextFocusableColumn(columns, nextIdx + direction, direction);
      nextIdx = focusableIdx >= 0 && focusableIdx < columnsCount ? focusableIdx : currentIdx;
    }
  }

  if (cellNavigationMode === 'CHANGE_ROW') {
    const isAfterLastColumn = nextIdx === columnsCount;
    const isBeforeFirstColumn = nextIdx === -1;

    if (isAfterLastColumn) {
      const isLastRow = nextRowIdx === maxRowIdx;
      if (!isLastRow) {
        nextIdx = 0;
        nextRowIdx += 1;
      }
    } else if (isBeforeFirstColumn) {
      const isFirstRow = nextRowIdx === minRowIdx;
      if (!isFirstRow) {
        nextRowIdx -= 1;
        nextIdx = columnsCount - 1;
      }
    }
  }

  return { idx: nextIdx, rowIdx: nextRowIdx };
}

interface CanExitGridOpts {
  maxColIdx: number;
  minRowIdx: number;
  maxRowIdx: number;
  selectedPosition: Position;
  shiftKey: boolean;
}

export function canExitGrid({ maxColIdx, minRowIdx, maxRowIdx, selectedPosition: { rowIdx, idx }, shiftKey }: CanExitGridOpts): boolean {
  const atLastCellInRow = idx === maxColIdx;
  const atFirstCellInRow = idx === 0;
  const atLastRow = rowIdx === maxRowIdx;
  const atFirstRow = rowIdx === minRowIdx;

  return shiftKey ? atFirstCellInRow && atFirstRow : atLastCellInRow && atLastRow;
}
