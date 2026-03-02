import { useMemo } from 'react';
import { renderValue } from '../cellRenderers';
import { SELECT_COLUMN_KEY } from '../columns';
import type { DataGridProps } from '../data-grid';
import { renderHeaderCell } from '../render-header-cell';
import type { BreakpointKey, CalculatedColumn, CalculatedColumnParent, ColumnOrColumnGroup, Omit } from '../types';
import { breakpointOrder, clampColumnWidth } from '../utils';

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
  /** Whether mobile sub-rows are active (hides columns with mobileRole: 'sub') */
  isMobileSubRowsActive?: boolean;
}

export function useCalculatedColumns<R, SR>({
  rawColumns,
  defaultColumnOptions,
  getColumnWidth,
  currentBreakpoint = 'lg',
  isMobileSubRowsActive = false,
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

  const { columns, colSpanColumns, lastFrozenColumnIndex, headerRowsCount, subColumns } = useMemo(() => {
    let lastFrozenColumnIndex = -1;
    let headerRowsCount = 1;
    const columns: MutableCalculatedColumn<R, SR>[] = [];
    const subColumns: MutableCalculatedColumn<R, SR>[] = [];

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

        const column: MutableCalculatedColumn<R, SR> = {
          ...rawColumn,
          parent,
          idx: 0,
          level: 0,
          frozen,
          focusable: rawColumn.focusable ?? true,
          width: rawColumn.width ?? defaultWidth,
          minWidth: rawColumn.minWidth ?? defaultMinWidth,
          maxWidth: rawColumn.maxWidth ?? defaultMaxWidth,
          sortable: rawColumn.sortable ?? defaultSortable,
          resizable: isMobile ? false : (rawColumn.resizable ?? defaultResizable),
          draggable: rawColumn.draggable ?? defaultDraggable,
          renderCell: rawColumn.renderCell ?? defaultRenderCell,
          renderHeaderCell: rawColumn.renderHeaderCell ?? defaultRenderHeaderCell,
        };

        // If mobile sub-rows are active and column has mobileRole: 'sub', move to subColumns
        if (isMobileSubRowsActive && rawColumn.mobileRole === 'sub') {
          subColumns.push(column);
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

    return {
      columns,
      colSpanColumns,
      lastFrozenColumnIndex,
      headerRowsCount,
      subColumns,
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
    isMobileSubRowsActive,
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

    for (const column of columns) {
      const width = getColumnWidth(column);

      if (typeof width === 'number') {
        const clampedWidth = clampColumnWidth(width, column);
        templateColumns.push(`${clampedWidth}px`);
        columnMetrics.set(column, { width: clampedWidth, left });
        left += clampedWidth;
      } else {
        // CSS-native flex distribution — CSS grid handles sizing between breakpoints.
        // No JS measurement needed; minmax distributes remaining space with proper constraints.
        const maxBound = column.maxWidth ? `${column.maxWidth}px` : '1fr';
        templateColumns.push(`minmax(${column.minWidth}px, ${maxBound})`);
        columnMetrics.set(column, { width: column.minWidth, left });
        left += column.minWidth;
      }
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
    subColumns,
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
