import type { ReactElement, ReactNode } from 'react';
import type { CalculatedColumn } from './types';

export interface MobileSubRowProps<R, SR> {
  /** The row data */
  row: R;
  /** Row index in the grid */
  rowIdx: number;
  /** Columns to render in the sub-row (those with mobileRole: 'sub') */
  subColumns: readonly CalculatedColumn<R, SR>[];
  /** Whether the sub-row is expanded */
  isExpanded: boolean;
}

/**
 * Mobile sub-row component that renders hidden columns as key-value pairs.
 * Used when enableMobileSubRows is active and columns have mobileRole: 'sub'.
 */
export function MobileSubRow<R, SR>({ row, rowIdx, subColumns, isExpanded }: MobileSubRowProps<R, SR>): ReactNode {
  if (!isExpanded || subColumns.length === 0) return null;

  return (
    <div className="rdg-mobile-sub-row" role="row" aria-rowindex={rowIdx + 1}>
      {subColumns.map((column) => {
        // Get the label - use mobileLabel if provided, otherwise column name
        const label = column.mobileLabel ?? (typeof column.name === 'string' ? column.name : column.key);

        // Get the rendered value using the column's renderCell
        const rawValue = column.renderCell({
          column,
          row,
          rowIdx,
          isCellEditable: false,
          tabIndex: -1,
          onRowChange: () => {},
        });
        const value =
          rawValue == null && column.placeholderValue != null ? (
            <span className="text-muted">{column.placeholderValue}</span>
          ) : (
            rawValue
          );

        return (
          <div
            key={column.key}
            className="flex items-start gap-2 py-1 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border/50"
          >
            <span className="shrink-0 font-medium text-muted-foreground min-w-24">{label}</span>
            <span className="grow text-foreground overflow-hidden text-ellipsis">{value}</span>
          </div>
        );
      })}
    </div>
  );
}

export interface MobileExpandToggleProps {
  /** Whether the row is expanded */
  isExpanded: boolean;
  /** Callback to toggle expansion */
  onToggle: () => void;
  /** Whether there are sub-columns to show */
  hasSubColumns: boolean;
  /** Optional custom icon */
  icon?: ReactElement;
}

/**
 * Toggle button for expanding/collapsing mobile sub-rows.
 */
export function MobileExpandToggle({ isExpanded, onToggle, hasSubColumns, icon }: MobileExpandToggleProps): ReactNode {
  if (!hasSubColumns) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onToggle();
    }
  };

  return (
    <button
      type="button"
      className="rdg-mobile-expand-toggle"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-expanded={isExpanded}
      aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
    >
      {icon ?? (
        <svg
          className="rdg-mobile-expand-icon"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease-in-out',
          }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
    </button>
  );
}
