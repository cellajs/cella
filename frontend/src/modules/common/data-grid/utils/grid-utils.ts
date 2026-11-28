import type { CalculatedColumn } from '../types';

export * from './breakpoint-utils';
export * from './clipboard-utils';
export * from './dom-utils';
export * from './event-utils';
export * from './keyboard-utils';
export * from './merge-utils';
export * from './render-measuring-cells';
export * from './selected-cell-utils';
export * from './style-utils';
export * from './wrap-text-utils';

export const { min, max, floor, sign } = Math;

export function clampColumnWidth<R, SR>(width: number, { minWidth, maxWidth }: CalculatedColumn<R, SR>): number {
  const clampedWidth = max(width, minWidth);

  // ignore maxWidth if it less than minWidth
  if (typeof maxWidth === 'number' && maxWidth >= minWidth) return min(clampedWidth, maxWidth);

  return clampedWidth;
}
