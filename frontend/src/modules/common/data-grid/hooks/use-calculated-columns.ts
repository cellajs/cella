import { useMemo } from 'react';
import { renderValue } from '../cell-renderers';
import { selectColumnKey } from '../columns';
import { renderHeaderCell } from '../render-header-cell';
import type { ActiveModes, BreakpointKey, CalculatedColumn, Column, ColumnMergeRule, DefaultColumnOptions, MergedSlot, TileSide } from '../types';
import { breakpointOrder, clampColumnWidth, resolveMergeRule, resolveModeOverrides, warnInvalidMergeRule } from '../utils/grid-utils';

type MutableCalculatedColumn<R, SR> = { -readonly [P in keyof CalculatedColumn<R, SR>]: CalculatedColumn<R, SR>[P] };

const defaultColumnWidth = 'auto';
const defaultColumnMinWidth = 50;
/** A slim sortable header's icon and sort chevrons side by side (size-4, gap-2) inside the cell's px-2. */
const sortableIconMinWidth = 56;
const defaultActiveModes: ActiveModes = { compact: false, mobile: false };

interface CalculatedColumnsArgs<R, SR> {
  rawColumns: readonly Column<R, SR>[];
  defaultColumnOptions: DefaultColumnOptions<R, SR> | undefined | null;
  getColumnWidth: (column: CalculatedColumn<R, SR>) => string | number;
  currentBreakpoint?: BreakpointKey;
  activeModes?: ActiveModes;
}

export function useCalculatedColumns<R, SR>({
  rawColumns,
  defaultColumnOptions,
  getColumnWidth,
  currentBreakpoint = 'lg',
  activeModes = defaultActiveModes,
}: CalculatedColumnsArgs<R, SR>) {
  const defaultWidth = defaultColumnOptions?.width ?? defaultColumnWidth;
  const defaultMinWidth = defaultColumnOptions?.minWidth ?? defaultColumnMinWidth;
  const defaultMaxWidth = defaultColumnOptions?.maxWidth ?? undefined;
  const defaultRenderCell = defaultColumnOptions?.renderCell ?? renderValue;
  const defaultRenderHeaderCell = defaultColumnOptions?.renderHeaderCell ?? renderHeaderCell;
  const defaultSortable = defaultColumnOptions?.sortable ?? false;
  const defaultResizable = defaultColumnOptions?.resizable ?? false;

  // Disable resizing on mobile breakpoints (xs, sm) since it's not useful on touch devices
  const isMobile = currentBreakpoint === 'xs' || currentBreakpoint === 'sm';

  const columns = useMemo(() => {
    const columns: MutableCalculatedColumn<R, SR>[] = [];
    const slotColumns: { column: MutableCalculatedColumn<R, SR>; rule: ColumnMergeRule }[] = [];

    const bp = breakpointOrder[currentBreakpoint];
    const isVisibleAtBreakpoint = (column: Column<R, SR>): boolean => {
      if (column.minBreakpoint && bp < breakpointOrder[column.minBreakpoint]) return false;
      if (column.maxBreakpoint && bp > breakpointOrder[column.maxBreakpoint]) return false;
      return true;
    };

    // A merge activates only when its host is visible and not itself merged; invalid rules leave the column visible.
    const validMerges = new Map<string, ColumnMergeRule>();
    {
      const gridKeys = new Set<string>();
      const candidates = new Map<string, ColumnMergeRule>();
      for (const col of rawColumns) {
        if (col.hidden) continue;
        const rule = resolveMergeRule(col, activeModes);
        if (rule != null) candidates.set(col.key, rule);
        else if (isVisibleAtBreakpoint(col)) gridKeys.add(col.key);
      }
      for (const [key, rule] of candidates) {
        if (gridKeys.has(rule.into)) validMerges.set(key, rule);
        else warnInvalidMergeRule(key, rule.into);
      }
    }

    for (const rawColumn of rawColumns) {
      // Reactive hide flag, such as a column-visibility toggle: excluded like a failing breakpoint.
      if (rawColumn.hidden) continue;

      // Merged columns move into their host cell, so they skip the breakpoint visibility check.
      const mergeRule = validMerges.get(rawColumn.key);
      if (mergeRule == null && !isVisibleAtBreakpoint(rawColumn)) continue;

      const overrides = resolveModeOverrides(rawColumn, activeModes);
      const sortable = rawColumn.sortable ?? defaultSortable;
      const minWidth = overrides.minWidth ?? rawColumn.minWidth ?? defaultMinWidth;

      const column: MutableCalculatedColumn<R, SR> = {
        ...rawColumn,
        idx: 0,
        focusable: rawColumn.focusable ?? true,
        width: overrides.width ?? rawColumn.width ?? defaultWidth,
        minWidth: rawColumn.icon && sortable ? Math.max(minWidth, sortableIconMinWidth) : minWidth,
        maxWidth: overrides.maxWidth ?? rawColumn.maxWidth ?? defaultMaxWidth,
        sortable,
        resizable: isMobile ? false : (rawColumn.resizable ?? defaultResizable),
        renderCell: rawColumn.renderCell ?? defaultRenderCell,
        renderHeaderCell: rawColumn.renderHeaderCell ?? defaultRenderHeaderCell,
      };

      if (mergeRule != null) slotColumns.push({ column, rule: mergeRule });
      else columns.push(column);
    }

    columns.sort(({ key: aKey }, { key: bKey }) => {
      if (aKey === selectColumnKey) return -1;
      if (bKey === selectColumnKey) return 1;
      return 0;
    });

    columns.forEach((column, idx) => {
      column.idx = idx;
    });

    // Grouped by side and sorted by `order`, ties keeping column order; hosts always resolve because invalid rules were dropped above.
    if (slotColumns.length > 0) {
      const slotsByHost = new Map<string, typeof slotColumns>();
      for (const slot of slotColumns) {
        const hostSlots = slotsByHost.get(slot.rule.into);
        if (hostSlots) hostSlots.push(slot);
        else slotsByHost.set(slot.rule.into, [slot]);
      }
      for (const [hostKey, hostSlots] of slotsByHost) {
        const host = columns.find((column) => column.key === hostKey)!;
        hostSlots.sort((a, b) => {
          const orderA = a.rule.order ?? Number.POSITIVE_INFINITY;
          const orderB = b.rule.order ?? Number.POSITIVE_INFINITY;
          return orderA === orderB ? 0 : orderA - orderB;
        });
        const mergedSlots: Record<TileSide, MergedSlot<R, SR>[]> = { top: [], right: [], bottom: [], left: [] };
        for (const { column, rule } of hostSlots) {
          // Slot columns share the host's idx so renderCell gets a usable CalculatedColumn and row-change metadata stays in bounds.
          column.idx = host.idx;
          mergedSlots[rule.side].push({ column, className: rule.className, width: rule.width });
        }
        host.mergedSlots = mergedSlots;
      }
    }

    return columns;
  }, [
    rawColumns,
    defaultWidth,
    defaultMinWidth,
    defaultMaxWidth,
    defaultRenderCell,
    defaultRenderHeaderCell,
    defaultResizable,
    defaultSortable,
    currentBreakpoint,
    isMobile,
    activeModes,
  ]);

  const templateColumns = useMemo((): readonly string[] => {
    const templateColumns: string[] = [];

    let hasFlexColumn = false;
    let lastAutoColumnIndex = -1;

    for (let i = 0; i < columns.length; i++) {
      const column = columns[i];
      const width = getColumnWidth(column);

      if (typeof width === 'number') {
        templateColumns.push(`${clampColumnWidth(width, column)}px`);
      } else {
        // CSS grid minmax distributes remaining space without JS measurement; maxWidth applies only during resize.
        lastAutoColumnIndex = i;
        hasFlexColumn = true;
        templateColumns.push(`minmax(${column.minWidth}px, ${column.minWidth}fr)`);
      }
    }

    // Ensure at least one column can grow to fill remaining space
    if (!hasFlexColumn && templateColumns.length > 0) {
      const idx = lastAutoColumnIndex !== -1 ? lastAutoColumnIndex : templateColumns.length - 1;
      const col = columns[idx];
      templateColumns[idx] = `minmax(${col.minWidth}px, ${col.minWidth}fr)`;
    }

    return templateColumns;
  }, [getColumnWidth, columns]);

  return { columns, templateColumns };
}
