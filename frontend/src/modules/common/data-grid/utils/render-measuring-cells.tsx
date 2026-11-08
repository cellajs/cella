import type { CalculatedColumn } from '../types';

export const renderMeasuringCells = <R, SR>(viewportColumns: readonly CalculatedColumn<R, SR>[]) =>
  viewportColumns.map(({ key, idx, minWidth, maxWidth }) => (
    <div
      key={key}
      className="invisible [contain:strict]"
      style={{ gridColumnStart: idx + 1, gridRow: 1, minWidth, maxWidth }}
      data-measuring-cell-key={key}
    />
  ));
