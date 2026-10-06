import type { CellRange, Position } from '../types';

/** Normalizes a range so start is top-left and end is bottom-right. */
export function normalizeCellRange(range: CellRange): CellRange {
  const minIdx = Math.min(range.start.idx, range.end.idx);
  const maxIdx = Math.max(range.start.idx, range.end.idx);
  const minRowIdx = Math.min(range.start.rowIdx, range.end.rowIdx);
  const maxRowIdx = Math.max(range.start.rowIdx, range.end.rowIdx);

  return { start: { idx: minIdx, rowIdx: minRowIdx }, end: { idx: maxIdx, rowIdx: maxRowIdx } };
}

export function isCellInRange(position: Position, range: CellRange): boolean {
  const normalized = normalizeCellRange(range);
  return (
    position.idx >= normalized.start.idx &&
    position.idx <= normalized.end.idx &&
    position.rowIdx >= normalized.start.rowIdx &&
    position.rowIdx <= normalized.end.rowIdx
  );
}

export function createRange(anchor: Position, focus: Position): CellRange {
  return { start: anchor, end: focus };
}

/** Which range edges a cell sits on, for border styling. */
export function getCellRangeBoundary(position: Position, range: CellRange): { isTop: boolean; isBottom: boolean; isLeft: boolean; isRight: boolean } {
  const normalized = normalizeCellRange(range);

  return {
    isTop: position.rowIdx === normalized.start.rowIdx,
    isBottom: position.rowIdx === normalized.end.rowIdx,
    isLeft: position.idx === normalized.start.idx,
    isRight: position.idx === normalized.end.idx,
  };
}
