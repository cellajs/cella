import { useEffect, useMemo, useState } from 'react';

import type { Column, ColumnOrColumnGroup } from '../types';

export type ResponsiveBreakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/** Column with responsive visibility configuration */
export interface ResponsiveColumn<R, SR = unknown> extends Column<R, SR> {
  /** Minimum breakpoint at which this column is visible. If undefined, always visible */
  minBreakpoint?: ResponsiveBreakpoint;
  /** Maximum breakpoint at which this column is visible. If undefined, no max */
  maxBreakpoint?: ResponsiveBreakpoint;
  /** Whether to include this column's data in expanded row detail when hidden */
  showInDetail?: boolean;
}

export interface ResponsiveColumnGroup<R, SR = unknown> {
  name: string;
  headerCellClass?: string;
  children: readonly ResponsiveColumn<R, SR>[];
  minBreakpoint?: ResponsiveBreakpoint;
  maxBreakpoint?: ResponsiveBreakpoint;
}

export type ResponsiveColumnOrColumnGroup<R, SR = unknown> = ResponsiveColumn<R, SR> | ResponsiveColumnGroup<R, SR>;

/** Default Tailwind breakpoints in pixels */
const DEFAULT_BREAKPOINTS: Record<ResponsiveBreakpoint, number> = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

export interface ResponsiveColumnsOptions<R, SR> {
  /** All columns with responsive configuration */
  columns: readonly ResponsiveColumnOrColumnGroup<R, SR>[];
  /** Custom breakpoint widths (defaults to Tailwind breakpoints) */
  breakpoints?: Partial<Record<ResponsiveBreakpoint, number>>;
  /** Current window width. If provided, disables internal resize listener */
  windowWidth?: number;
}

export interface ResponsiveColumnsResult<R, SR> {
  /** Columns visible at the current breakpoint */
  visibleColumns: readonly ColumnOrColumnGroup<R, SR>[];
  /** Columns hidden at the current breakpoint (for row detail rendering) */
  hiddenColumns: readonly ResponsiveColumn<R, SR>[];
  /** Current active breakpoint */
  currentBreakpoint: ResponsiveBreakpoint;
  /** Current window width */
  windowWidth: number;
}

function getBreakpoint(width: number, breakpoints: Record<ResponsiveBreakpoint, number>): ResponsiveBreakpoint {
  if (width >= breakpoints['2xl']) return '2xl';
  if (width >= breakpoints.xl) return 'xl';
  if (width >= breakpoints.lg) return 'lg';
  if (width >= breakpoints.md) return 'md';
  if (width >= breakpoints.sm) return 'sm';
  return 'xs';
}

function isColumnVisible<R, SR>(
  column: ResponsiveColumn<R, SR> | ResponsiveColumnGroup<R, SR>,
  currentBreakpoint: ResponsiveBreakpoint,
  breakpoints: Record<ResponsiveBreakpoint, number>,
): boolean {
  const minWidth = column.minBreakpoint ? breakpoints[column.minBreakpoint] : 0;
  const maxWidth = column.maxBreakpoint ? breakpoints[column.maxBreakpoint] : Infinity;
  const currentWidth = breakpoints[currentBreakpoint];

  return currentWidth >= minWidth && currentWidth <= maxWidth;
}

function isColumnGroup<R, SR>(column: ResponsiveColumnOrColumnGroup<R, SR>): column is ResponsiveColumnGroup<R, SR> {
  return 'children' in column;
}

/**
 * Hook to manage responsive column visibility based on screen width
 * Automatically hides columns below their minimum breakpoint
 */
export function useResponsiveColumns<R, SR = unknown>({
  columns,
  breakpoints: customBreakpoints,
  windowWidth: controlledWidth,
}: ResponsiveColumnsOptions<R, SR>): ResponsiveColumnsResult<R, SR> {
  const breakpoints = useMemo(() => ({ ...DEFAULT_BREAKPOINTS, ...customBreakpoints }), [customBreakpoints]);

  const [internalWidth, setInternalWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : breakpoints.lg,
  );

  const windowWidth = controlledWidth ?? internalWidth;

  useEffect(() => {
    if (controlledWidth !== undefined) return;

    const handleResize = () => {
      setInternalWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [controlledWidth]);

  const currentBreakpoint = useMemo(() => getBreakpoint(windowWidth, breakpoints), [windowWidth, breakpoints]);

  const { visibleColumns, hiddenColumns } = useMemo(() => {
    const visible: ColumnOrColumnGroup<R, SR>[] = [];
    const hidden: ResponsiveColumn<R, SR>[] = [];

    for (const column of columns) {
      if (isColumnGroup(column)) {
        // For column groups, filter children
        const visibleChildren = column.children.filter((child) =>
          isColumnVisible(child, currentBreakpoint, breakpoints),
        );
        const hiddenChildren = column.children.filter(
          (child) => !isColumnVisible(child, currentBreakpoint, breakpoints) && child.showInDetail !== false,
        );

        if (visibleChildren.length > 0 && isColumnVisible(column, currentBreakpoint, breakpoints)) {
          visible.push({
            ...column,
            children: visibleChildren,
          } as ColumnOrColumnGroup<R, SR>);
        }

        hidden.push(...hiddenChildren);
      } else {
        if (isColumnVisible(column, currentBreakpoint, breakpoints)) {
          visible.push(column as ColumnOrColumnGroup<R, SR>);
        } else if (column.showInDetail !== false) {
          hidden.push(column);
        }
      }
    }

    return { visibleColumns: visible, hiddenColumns: hidden };
  }, [columns, currentBreakpoint, breakpoints]);

  return {
    visibleColumns,
    hiddenColumns,
    currentBreakpoint,
    windowWidth,
  };
}
