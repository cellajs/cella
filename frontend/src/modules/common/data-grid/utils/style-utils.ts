import type { CSSProperties } from 'react';
import { cn } from '~/utils/cn';
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
  // Hosts with merged slots scope the line-clamp to the main-content wrapper:
  // clamping direct children would set display:-webkit-box on the slot/layout
  // wrappers and break their flex layout.
  const hasMergedSlots = column.mergedSlots != null;
  const textOverflow =
    wrapLines > 0
      ? hasMergedSlots
        ? 'whitespace-pre-line overflow-hidden [&_[data-tile-main]>*]:line-clamp-[var(--rdg-wrap-text-lines,none)] [&_[data-tile-main]>*]:text-ellipsis [&_[data-tile-main]>*]:!py-0'
        : 'whitespace-pre-line overflow-hidden [&>*]:line-clamp-[var(--rdg-wrap-text-lines,none)] [&>*]:text-ellipsis [&>*]:!py-0'
      : 'whitespace-nowrap overflow-clip text-ellipsis';
  return cn(
    `rdg-cell flex items-center group/cell relative py-0 px-2 bg-inherit outline-none scroll-mt-32 border-t-[0.05rem] border-border ${textOverflow}`,
    'sm:group-hover/row:bg-accent/40',
    'aria-selected:outline-2 aria-selected:outline-primary aria-selected:outline-solid aria-selected:-outline-offset-2',
    '[&:not([aria-readonly=true])]:aria-selected:bg-accent/60',
    'max-xs:aria-selected:bg-transparent max-xs:aria-selected:outline-none',
    '[.rdg-readonly_&]:aria-selected:outline-none',
    { 'rdg-cell-frozen sticky z-1': column.frozen },
    ...extraClasses,
  );
}
