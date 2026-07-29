import type { CalculatedColumn, CalculatedColumnOrColumnGroup, Maybe } from '../types';

export * from './breakpoint-utils';
export * from './cell-range-utils';
export * from './clipboard-utils';
export * from './col-span-utils';
export * from './dom-utils';
export * from './event-utils';
export * from './keyboard-utils';
export * from './merge-utils';
export * from './render-measuring-cells';
export * from './selected-cell-utils';
export * from './style-utils';
export * from './wrap-text-utils';

/** Exposes the Math helpers used throughout the data grid. */
export const { min, max, floor, sign } = Math;

/** Asserts that row selection has a valid key getter. */
export function assertIsValidKeyGetter<R, K extends React.Key>(
  keyGetter: Maybe<(row: NoInfer<R>) => K>,
): asserts keyGetter is (row: R) => K {
  if (typeof keyGetter !== 'function') {
    throw new Error('Please specify the rowKeyGetter prop to use selection');
  }
}

/** Clamps column width to its supported range. */
export function clampColumnWidth<R, SR>(width: number, { minWidth, maxWidth }: CalculatedColumn<R, SR>): number {
  const clampedWidth = max(width, minWidth);

  // ignore maxWidth if it less than minWidth
  if (typeof maxWidth === 'number' && maxWidth >= minWidth) {
    return min(clampedWidth, maxWidth);
  }

  return clampedWidth;
}

/** Returns the header cell row span. */
export function getHeaderCellRowSpan<R, SR>(column: CalculatedColumnOrColumnGroup<R, SR>, rowIdx: number) {
  return column.parent === undefined ? rowIdx : column.level - column.parent.level;
}
