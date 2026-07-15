import { useMemo } from 'react';
import { renderValue } from '../cell-renderers';
import { SELECT_COLUMN_KEY } from '../columns';
import { renderHeaderCell } from '../render-header-cell';
import type {
  ActiveModes,
  BreakpointKey,
  CalculatedColumn,
  CalculatedColumnParent,
  Column,
  ColumnMergeRule,
  ColumnOrColumnGroup,
  DefaultColumnOptions,
  MergedSlot,
  Omit,
  TileSide,
} from '../types';
import {
  breakpointOrder,
  clampColumnWidth,
  resolveMergeRule,
  resolveModeOverrides,
  warnInvalidMergeRule,
} from '../utils/grid-utils';

type Mutable<T> = {
  -readonly [P in keyof T]: T[P] extends ReadonlyArray<infer V> ? Mutable<V>[] : T[P];
};

interface WithParent<R, SR> {
  readonly parent: MutableCalculatedColumnParent<R, SR> | undefined;
}

type MutableCalculatedColumnParent<R, SR> = Omit<Mutable<CalculatedColumnParent<R, SR>>, 'parent'> & WithParent<R, SR>;
type MutableCalculatedColumn<R, SR> = Omit<Mutable<CalculatedColumn<R, SR>>, 'parent'> & WithParent<R, SR>;

interface ColumnMetric {
  width: number;
  left: number;
}

const DEFAULT_COLUMN_WIDTH = 'auto';
const DEFAULT_COLUMN_MIN_WIDTH = 50;
const DEFAULT_ACTIVE_MODES: ActiveModes = { compact: false, mobile: false };

interface CalculatedColumnsArgs<R, SR> {
  rawColumns: readonly ColumnOrColumnGroup<R, SR>[];
  defaultColumnOptions: DefaultColumnOptions<R, SR> | undefined | null;
  getColumnWidth: (column: CalculatedColumn<R, SR>) => string | number;
  /** Current breakpoint for responsive column visibility */
  currentBreakpoint?: BreakpointKey;

  /** Which display modes are active (applies per-column `modes` overrides and merge rules) */
  activeModes?: ActiveModes;
}

export function useCalculatedColumns<R, SR>({
  rawColumns,
  defaultColumnOptions,
  getColumnWidth,
  currentBreakpoint = 'lg',

  activeModes = DEFAULT_ACTIVE_MODES,
}: CalculatedColumnsArgs<R, SR>) {
  const defaultWidth = defaultColumnOptions?.width ?? DEFAULT_COLUMN_WIDTH;
  const defaultMinWidth = defaultColumnOptions?.minWidth ?? DEFAULT_COLUMN_MIN_WIDTH;
  const defaultMaxWidth = defaultColumnOptions?.maxWidth ?? undefined;
  const defaultRenderCell = defaultColumnOptions?.renderCell ?? renderValue;
  const defaultRenderHeaderCell = defaultColumnOptions?.renderHeaderCell ?? renderHeaderCell;
  const defaultSortable = defaultColumnOptions?.sortable ?? false;
  const defaultResizable = defaultColumnOptions?.resizable ?? false;
  const defaultDraggable = defaultColumnOptions?.draggable ?? false;

  // Disable resizing on mobile breakpoints (xs, sm) since it's not useful on touch devices
  const isMobile = currentBreakpoint === 'xs' || currentBreakpoint === 'sm';

  const { columns, colSpanColumns, lastFrozenColumnIndex, headerRowsCount } = useMemo(() => {
    let lastFrozenColumnIndex = -1;
    let headerRowsCount = 1;
    const columns: MutableCalculatedColumn<R, SR>[] = [];
    const slotColumns: { column: MutableCalculatedColumn<R, SR>; rule: ColumnMergeRule }[] = [];

    const bp = breakpointOrder[currentBreakpoint];
    const isVisibleAtBreakpoint = (column: Column<R, SR>): boolean => {
      if (column.minBreakpoint && bp < breakpointOrder[column.minBreakpoint]) return false;
      if (column.maxBreakpoint && bp > breakpointOrder[column.maxBreakpoint]) return false;
      return true;
    };

    // Resolve merge rules up front: a rule is only valid when its host resolves
    // to a real grid column right now (visible at this breakpoint, not merged
    // away itself). Invalid rules deactivate, and the column falls back to
    // its normal visibility rules below.
    const validMerges = new Map<string, ColumnMergeRule>();
    {
      const gridKeys = new Set<string>();
      const candidates = new Map<string, ColumnMergeRule>();
      const visitLeaves = (cols: readonly ColumnOrColumnGroup<R, SR>[]) => {
        for (const col of cols) {
          if (col.hidden) continue;
          if ('children' in col) {
            visitLeaves(col.children);
            continue;
          }
          const rule = resolveMergeRule(col, activeModes);
          if (rule != null) candidates.set(col.key, rule);
          else if (isVisibleAtBreakpoint(col)) gridKeys.add(col.key);
        }
      };
      visitLeaves(rawColumns);
      for (const [key, rule] of candidates) {
        if (gridKeys.has(rule.into)) validMerges.set(key, rule);
        else warnInvalidMergeRule(key, rule.into);
      }
    }

    collectColumns(rawColumns, 1);

    function collectColumns(
      rawColumns: readonly ColumnOrColumnGroup<R, SR>[],
      level: number,
      parent?: MutableCalculatedColumnParent<R, SR>,
    ) {
      for (const rawColumn of rawColumns) {
        // Reactive hide flag, such as a column-visibility toggle: hard exclude, same as a failing breakpoint.
        if (rawColumn.hidden) continue;

        if ('children' in rawColumn) {
          const calculatedColumnParent: MutableCalculatedColumnParent<R, SR> = {
            name: rawColumn.name,
            parent,
            idx: -1,
            colSpan: 0,
            level: 0,
            headerCellClass: rawColumn.headerCellClass,
          };

          collectColumns(rawColumn.children, level + 1, calculatedColumnParent);
          continue;
        }

        // Merged columns are relocated into their host cell rather than hidden, so they
        // bypass the breakpoint visibility check.
        const mergeRule = validMerges.get(rawColumn.key);
        if (mergeRule == null && !isVisibleAtBreakpoint(rawColumn)) continue;

        const frozen = mergeRule == null && (rawColumn.frozen ?? false);

        // Per-mode width overrides (mobile > compact)
        const overrides = resolveModeOverrides(rawColumn, activeModes);

        const column: MutableCalculatedColumn<R, SR> = {
          ...rawColumn,
          // Slot columns don't take part in header/group layout
          parent: mergeRule == null ? parent : undefined,
          idx: 0,
          level: 0,
          frozen,
          focusable: rawColumn.focusable ?? true,
          width: overrides.width ?? rawColumn.width ?? defaultWidth,
          minWidth: overrides.minWidth ?? rawColumn.minWidth ?? defaultMinWidth,
          maxWidth: overrides.maxWidth ?? rawColumn.maxWidth ?? defaultMaxWidth,
          sortable: rawColumn.sortable ?? defaultSortable,
          resizable: isMobile ? false : (rawColumn.resizable ?? defaultResizable),
          draggable: rawColumn.draggable ?? defaultDraggable,
          renderCell: rawColumn.renderCell ?? defaultRenderCell,
          renderHeaderCell: rawColumn.renderHeaderCell ?? defaultRenderHeaderCell,
        };

        if (mergeRule != null) {
          slotColumns.push({ column, rule: mergeRule });
          continue;
        }

        columns.push(column);

        if (frozen) {
          lastFrozenColumnIndex++;
        }

        if (level > headerRowsCount) {
          headerRowsCount = level;
        }
      }
    }

    columns.sort(({ key: aKey, frozen: frozenA }, { key: bKey, frozen: frozenB }) => {
      // Sort select column first:
      if (aKey === SELECT_COLUMN_KEY) return -1;
      if (bKey === SELECT_COLUMN_KEY) return 1;

      // Sort frozen columns second:
      if (frozenA) {
        if (frozenB) return 0;
        return -1;
      }
      if (frozenB) return 1;

      // Sort other columns last:
      return 0;
    });

    const colSpanColumns: CalculatedColumn<R, SR>[] = [];
    columns.forEach((column, idx) => {
      column.idx = idx;
      updateColumnParent(column, idx, 0);

      if (column.colSpan != null) {
        colSpanColumns.push(column);
      }
    });

    // Grouped by side, sorted by `order` (ties keep column order). Hosts are
    // guaranteed present — rules with unresolvable hosts were deactivated above.
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
          if (orderA === orderB) return 0;
          return orderA - orderB;
        });
        const mergedSlots: Record<TileSide, MergedSlot<R, SR>[]> = { top: [], right: [], bottom: [], left: [] };
        for (const { column, rule } of hostSlots) {
          // Slot columns share the host's idx: consumer renderCell receives a
          // plausible CalculatedColumn, and row-change metadata stays in-bounds.
          column.idx = host.idx;
          mergedSlots[rule.side].push({ column: column as CalculatedColumn<R, SR>, className: rule.className });
        }
        host.mergedSlots = mergedSlots;
      }
    }

    return {
      columns,
      colSpanColumns,
      lastFrozenColumnIndex,
      headerRowsCount,
    };
  }, [
    rawColumns,
    defaultWidth,
    defaultMinWidth,
    defaultMaxWidth,
    defaultRenderCell,
    defaultRenderHeaderCell,
    defaultResizable,
    defaultSortable,
    defaultDraggable,
    currentBreakpoint,
    activeModes,
  ]);

  const { templateColumns, layoutCssVars, totalFrozenColumnWidth } = useMemo((): {
    templateColumns: readonly string[];
    layoutCssVars: Readonly<Record<string, string>>;
    totalFrozenColumnWidth: number;
  } => {
    const columnMetrics = new Map<CalculatedColumn<R, SR>, ColumnMetric>();
    let left = 0;
    let totalFrozenColumnWidth = 0;
    const templateColumns: string[] = [];

    let hasFlexColumn = false;
    let lastAutoColumnIndex = -1;

    for (let i = 0; i < columns.length; i++) {
      const column = columns[i];
      const width = getColumnWidth(column);

      if (typeof width === 'number') {
        const clampedWidth = clampColumnWidth(width, column);
        templateColumns.push(`${clampedWidth}px`);
        columnMetrics.set(column, { width: clampedWidth, left });
        left += clampedWidth;
      } else {
        // CSS-native flex: CSS grid + minmax distribute remaining space between
        // breakpoints, no JS measurement. maxWidth is enforced only during resize,
        // not for initial flex sizing.
        lastAutoColumnIndex = i;
        hasFlexColumn = true;
        templateColumns.push(`minmax(${column.minWidth}px, ${column.minWidth}fr)`);
        columnMetrics.set(column, { width: column.minWidth, left });
        left += column.minWidth;
      }
    }

    // Ensure at least one column can grow to fill remaining space
    if (!hasFlexColumn && templateColumns.length > 0) {
      const idx = lastAutoColumnIndex !== -1 ? lastAutoColumnIndex : templateColumns.length - 1;
      const col = columns[idx];
      templateColumns[idx] = `minmax(${col.minWidth}px, ${col.minWidth}fr)`;
    }

    if (lastFrozenColumnIndex !== -1) {
      const columnMetric = columnMetrics.get(columns[lastFrozenColumnIndex])!;
      totalFrozenColumnWidth = columnMetric.left + columnMetric.width;
    }

    const layoutCssVars: Record<string, string> = {};

    for (let i = 0; i <= lastFrozenColumnIndex; i++) {
      const column = columns[i];
      layoutCssVars[`--rdg-frozen-left-${column.idx}`] = `${columnMetrics.get(column)?.left}px`;
    }

    return { templateColumns, layoutCssVars, totalFrozenColumnWidth };
  }, [getColumnWidth, columns, lastFrozenColumnIndex]);

  return {
    columns,
    colSpanColumns,
    templateColumns,
    layoutCssVars,
    headerRowsCount,
    lastFrozenColumnIndex,
    totalFrozenColumnWidth,
  };
}

function updateColumnParent<R, SR>(
  column: MutableCalculatedColumn<R, SR> | MutableCalculatedColumnParent<R, SR>,
  index: number,
  level: number,
) {
  if (level < column.level) {
    column.level = level;
  }

  if (column.parent !== undefined) {
    const { parent } = column;
    if (parent.idx === -1) {
      parent.idx = index;
    }
    parent.colSpan += 1;
    updateColumnParent(parent, index, level - 1);
  }
}
