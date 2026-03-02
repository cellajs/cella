import type { CSSProperties } from 'react';
import { cn } from '~/utils/cn';
import { cellClassname, cellFrozenClassname, cellWrapTextClassname } from '../style/cell';
import type { CalculatedColumn, CalculatedColumnOrColumnGroup } from '../types';
import { resolveWrapTextLines } from './wrap-text-utils';

export { cn } from '~/utils/cn';

export function getRowStyle(rowIdx: number): CSSProperties {
  return { '--rdg-grid-row-start': rowIdx };
}

export function getHeaderCellStyle<R, SR>(
  column: CalculatedColumnOrColumnGroup<R, SR>,
  rowIdx: number,
  rowSpan: number,
): React.CSSProperties {
  const gridRowEnd = rowIdx + 1;
  const paddingBlockStart = `calc(${rowSpan - 1} * var(--rdg-header-row-height))`;

  if (column.parent === undefined) {
    return {
      insetBlockStart: 0,
      gridRowStart: 1,
      gridRowEnd,
      paddingBlockStart,
    };
  }

  return {
    insetBlockStart: `calc(${rowIdx - rowSpan} * var(--rdg-header-row-height))`,
    gridRowStart: gridRowEnd - rowSpan,
    gridRowEnd,
    paddingBlockStart,
  };
}

export function getCellStyle<R, SR>(column: CalculatedColumn<R, SR>, colSpan = 1): React.CSSProperties {
  const index = column.idx + 1;
  const wrapLines = resolveWrapTextLines(column.wrapText);
  return {
    gridColumnStart: index,
    gridColumnEnd: index + colSpan,
    insetInlineStart: column.frozen ? `var(--rdg-frozen-left-${column.idx})` : undefined,
    ...(wrapLines > 0 ? { '--rdg-wrap-text-lines': String(wrapLines) } : undefined),
  };
}

export function getCellClassname<R, SR>(
  column: CalculatedColumn<R, SR>,
  ...extraClasses: Parameters<typeof cn>
): string {
  const wrapLines = resolveWrapTextLines(column.wrapText);
  return cn(
    cellClassname,
    {
      [cellFrozenClassname]: column.frozen,
      [cellWrapTextClassname]: wrapLines > 0,
    },
    ...extraClasses,
  );
}
