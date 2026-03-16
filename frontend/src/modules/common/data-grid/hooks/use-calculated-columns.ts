import { useMemo } from 'react';
import { renderValue } from '../cellRenderers';
import { SELECT_COLUMN_KEY } from '../columns';
import type { DataGridProps } from '../data-grid';
import { renderHeaderCell } from '../render-header-cell';
import type { BreakpointKey, CalculatedColumn, CalculatedColumnParent, ColumnOrColumnGroup, Omit } from '../types';
import { breakpointOrder, clampColumnWidth } from '../utils/grid-utils';

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

interface CalculatedColumnsArgs<R, SR> {
  rawColumns: readonly ColumnOrColumnGroup<R, SR>[];
  defaultColumnOptions: DataGridProps<R, SR>['defaultColumnOptions'];
  getColumnWidth: (column: CalculatedColumn<R, SR>) => string | number;
  /** Current breakpoint for responsive column visibility */
  currentBreakpoint?: BreakpointKey;

  /** Whether compact mode is active (applies column compact overrides) */
  isCompact?: boolean;
}

export function useCalculatedColumns<R, SR>({
  rawColumns,
  defaultColumnOptions,
  getColumnWidth,
  currentBreakpoint = 'lg',

  isCompact = false,
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

    collectColumns(rawColumns, 1);

    function collectColumns(
      rawColumns: readonly ColumnOrColumnGroup<R, SR>[],
      level: number,
      parent?: MutableCalculatedColumnParent<R, SR>,
    ) {
      for (const rawColumn of rawColumns) {
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

        // Check visibility based on breakpoint props
        const bp = breakpointOrder[currentBreakpoint];
        if (rawColumn.minBreakpoint && bp < breakpointOrder[rawColumn.minBreakpoint]) continue;
        if (rawColumn.maxBreakpoint && bp > breakpointOrder[rawColumn.maxBreakpoint]) continue;

        const frozen = rawColumn.frozen ?? false;

        // Resolve compact overrides when compact mode is active
        const compactOverrides = isCompact ? rawColumn.compact : undefined;

        const column: MutableCalculatedColumn<R, SR> = {
          ...rawColumn,
          parent,
          idx: 0,
          level: 0,
          frozen,
          focusable: rawColumn.focusable ?? true,
          width: compactOverrides?.width ?? rawColumn.width ?? defaultWidth,
          minWidth: compactOverrides?.minWidth ?? rawColumn.minWidth ?? defaultMinWidth,
          maxWidth: compactOverrides?.maxWidth ?? rawColumn.maxWidth ?? defaultMaxWidth,
          sortable: rawColumn.sortable ?? defaultSortable,
          resizable: isMobile ? false : (rawColumn.resizable ?? defaultResizable),
          draggable: rawColumn.draggable ?? defaultDraggable,
          renderCell: rawColumn.renderCell ?? defaultRenderCell,
          renderHeaderCell: rawColumn.renderHeaderCell ?? defaultRenderHeaderCell,
        };

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
    isCompact,
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
        // CSS-native flex distribution — CSS grid handles sizing between breakpoints.
        // No JS measurement needed; minmax distributes remaining space with proper constraints.
        // maxWidth is only enforced during resize, not for initial flex sizing.
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
      layoutCssVars[`--rdg-frozen-left-${column.idx}`] = `${columnMetrics.get(column)!.left}px`;
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
