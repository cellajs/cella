import { cn } from '~/utils/cn';
import type { CalculatedColumn, CalculatedColumnOrColumnGroup } from '../types';
import { resolveWrapTextLines } from './wrap-text-utils';

export { cn } from '~/utils/cn';

export function getHeaderCellStyle<R, SR>(column: CalculatedColumnOrColumnGroup<R, SR>, rowIdx: number, rowSpan: number): React.CSSProperties {
  const gridRowEnd = rowIdx + 1;
  const paddingBlockStart = `calc(${rowSpan - 1} * var(--rdg-header-row-height))`;

  if (column.parent === undefined) return { insetBlockStart: 0, gridRowStart: 1, gridRowEnd, paddingBlockStart };

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

/** A body cell rings while focus is in it, clicked or not: arrow keys continue from there. */
export const bodyCellFocusRing = 'focus-ring:focus-within:outline-2 focus-ring:focus-within:outline-solid';

/** A header click sorts and moves no cell, so only the keyboard rings a header. */
export const headerCellFocusRing =
  'focus-ring:focus-visible:outline-2 focus-ring:focus-visible:outline-solid focus-ring:has-focus-visible:outline-2 focus-ring:has-focus-visible:outline-solid';

export function getCellClassname<R, SR>(column: CalculatedColumn<R, SR>, ...extraClasses: Parameters<typeof cn>): string {
  const wrapLines = resolveWrapTextLines(column.wrapText);
  // Hosts with merged slots clamp only the main-content wrapper: display:-webkit-box on a slot wrapper breaks its flex layout.
  const hasMergedSlots = column.mergedSlots != null;
  const textOverflow =
    wrapLines === 0
      ? 'whitespace-nowrap overflow-clip text-ellipsis'
      : // An unlimited wrap clamps no child: the clamp's overflow would cut the focus ring of a control in the cell
        column.wrapText === true
        ? 'whitespace-pre-line overflow-hidden'
        : hasMergedSlots
          ? 'whitespace-pre-line overflow-hidden [&_[data-tile-main]>*]:line-clamp-[var(--rdg-wrap-text-lines,none)] [&_[data-tile-main]>*]:text-ellipsis [&_[data-tile-main]>*]:py-0!'
          : 'whitespace-pre-line overflow-hidden [&>*]:line-clamp-[var(--rdg-wrap-text-lines,none)] [&>*]:text-ellipsis [&>*]:py-0!';
  return cn(
    `rdg-cell group/cell border-border relative flex items-center border-t-[0.05rem] bg-inherit px-2 py-0 outline-hidden ${textOverflow}`,
    'sm:group-hover/row:bg-hover',
    'outline-ring -outline-offset-2',
    { 'rdg-cell-frozen sticky z-1': column.frozen },
    ...extraClasses,
  );
}
