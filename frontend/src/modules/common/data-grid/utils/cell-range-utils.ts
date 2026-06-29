import type { CalculatedColumn, CellRange, Position } from '../types';

/**
 * Normalize a cell range so start is always top-left and end is bottom-right.
 */
export function normalizeCellRange(range: CellRange): CellRange {
  const minIdx = Math.min(range.start.idx, range.end.idx);
  const maxIdx = Math.max(range.start.idx, range.end.idx);
  const minRowIdx = Math.min(range.start.rowIdx, range.end.rowIdx);
  const maxRowIdx = Math.max(range.start.rowIdx, range.end.rowIdx);

  return {
    start: { idx: minIdx, rowIdx: minRowIdx },
    end: { idx: maxIdx, rowIdx: maxRowIdx },
  };
}

/**
 * Check if a cell position is within a given range.
 */
export function isCellInRange(position: Position, range: CellRange): boolean {
  const normalized = normalizeCellRange(range);
  return (
    position.idx >= normalized.start.idx &&
    position.idx <= normalized.end.idx &&
    position.rowIdx >= normalized.start.rowIdx &&
    position.rowIdx <= normalized.end.rowIdx
  );
}

/**
 * Get cells in a range along with their data.
 */
export function getCellsInRange<R, SR>(
  range: CellRange,
  rows: readonly R[],
  columns: readonly CalculatedColumn<R, SR>[],
): Array<{ row: R; column: CalculatedColumn<R, SR>; rowIdx: number; colIdx: number }> {
  const normalized = normalizeCellRange(range);
  const cells: Array<{ row: R; column: CalculatedColumn<R, SR>; rowIdx: number; colIdx: number }> = [];

  for (let rowIdx = normalized.start.rowIdx; rowIdx <= normalized.end.rowIdx; rowIdx++) {
    if (rowIdx < 0 || rowIdx >= rows.length) continue;
    const row = rows[rowIdx];

    for (let colIdx = normalized.start.idx; colIdx <= normalized.end.idx; colIdx++) {
      if (colIdx < 0 || colIdx >= columns.length) continue;
      const column = columns[colIdx];
      cells.push({ row, column, rowIdx, colIdx });
    }
  }

  return cells;
}

/**
 * Create a range from anchor position to new focus position.
 */
export function createRange(anchor: Position, focus: Position): CellRange {
  return { start: anchor, end: focus };
}

/**
 * Expand a range in a direction by one cell.
 */
export function expandRange(
  range: CellRange,
  anchor: Position,
  direction: 'up' | 'down' | 'left' | 'right',
  maxIdx: number,
  maxRowIdx: number,
): CellRange {
  const { start, end } = range;

  // Determine which edge to move based on anchor position
  const isAnchorAtStart = anchor.idx === start.idx && anchor.rowIdx === start.rowIdx;

  let newStart = { ...start };
  let newEnd = { ...end };

  switch (direction) {
    case 'up':
      if (isAnchorAtStart) {
        newEnd = { ...newEnd, rowIdx: Math.max(0, end.rowIdx - 1) };
      } else {
        newStart = { ...newStart, rowIdx: Math.max(0, start.rowIdx - 1) };
      }
      break;
    case 'down':
      if (isAnchorAtStart) {
        newEnd = { ...newEnd, rowIdx: Math.min(maxRowIdx, end.rowIdx + 1) };
      } else {
        newStart = { ...newStart, rowIdx: Math.min(maxRowIdx, start.rowIdx + 1) };
      }
      break;
    case 'left':
      if (isAnchorAtStart) {
        newEnd = { ...newEnd, idx: Math.max(0, end.idx - 1) };
      } else {
        newStart = { ...newStart, idx: Math.max(0, start.idx - 1) };
      }
      break;
    case 'right':
      if (isAnchorAtStart) {
        newEnd = { ...newEnd, idx: Math.min(maxIdx, end.idx + 1) };
      } else {
        newStart = { ...newStart, idx: Math.min(maxIdx, start.idx + 1) };
      }
      break;
  }

  return { start: newStart, end: newEnd };
}

/**
 * Get the boundary positions of a cell in a range (for border styling).
 */
export function getCellRangeBoundary(
  position: Position,
  range: CellRange,
): { isTop: boolean; isBottom: boolean; isLeft: boolean; isRight: boolean } {
  const normalized = normalizeCellRange(range);

  return {
    isTop: position.rowIdx === normalized.start.rowIdx,
    isBottom: position.rowIdx === normalized.end.rowIdx,
    isLeft: position.idx === normalized.start.idx,
    isRight: position.idx === normalized.end.idx,
  };
}
