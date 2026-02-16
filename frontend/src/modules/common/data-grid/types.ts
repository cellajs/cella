import type { Key, ReactElement, ReactNode } from 'react';

import type { DataGridProps } from './data-grid';

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type Maybe<T> = T | undefined | null;

export type StateSetter<S> = React.Dispatch<React.SetStateAction<S>>;

/** Supported breakpoint keys for responsive features */
export type BreakpointKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/**
 * Column visibility configuration.
 * Can be a boolean or breakpoint-based visibility rules.
 */
export type ColumnVisibility =
  | boolean
  | { min: BreakpointKey }
  | { max: BreakpointKey }
  | { min: BreakpointKey; max: BreakpointKey };

/** Cell position in the grid */
export interface Position {
  readonly idx: number;
  readonly rowIdx: number;
}

/**
 * A range of selected cells defined by start and end positions.
 * The range is inclusive and normalized (start <= end).
 */
export interface CellRange {
  readonly start: Position;
  readonly end: Position;
}

/**
 * Args passed to onSelectedCellRangeChange callback
 */
export interface SelectedCellRangeChangeArgs<R, SR> {
  range: CellRange | null;
  cells?: Array<{ row: R; column: CalculatedColumn<R, SR>; rowIdx: number; colIdx: number }>;
}

export interface Column<TRow, TSummaryRow = unknown> {
  /** The name of the column. Displayed in the header cell by default */
  readonly name: string | ReactElement;
  /** A unique key to distinguish each column */
  readonly key: string;
  /**
   * Column width. If not specified, it will be determined automatically based on grid width and specified widths of other columns
   * @default 'auto'
   */
  readonly width?: Maybe<number | string>;
  /**
   * Minimum column width in pixels
   * @default 50
   */
  readonly minWidth?: Maybe<number>;
  /** Maximum column width in pixels */
  readonly maxWidth?: Maybe<number>;
  /** Class name(s) for cells */
  readonly cellClass?: Maybe<string | ((row: TRow) => Maybe<string>)>;
  /** Class name(s) for the header cell */
  readonly headerCellClass?: Maybe<string>;
  /** Class name(s) for summary cells */
  readonly summaryCellClass?: Maybe<string | ((row: TSummaryRow) => Maybe<string>)>;
  /** Render function to render the content of cells */
  readonly renderCell?: Maybe<(props: RenderCellProps<TRow, TSummaryRow>) => ReactNode>;
  /** Render function to render the content of the header cell */
  readonly renderHeaderCell?: Maybe<(props: RenderHeaderCellProps<TRow, TSummaryRow>) => ReactNode>;
  /** Render function to render the content of summary cells */
  readonly renderSummaryCell?: Maybe<(props: RenderSummaryCellProps<TSummaryRow, TRow>) => ReactNode>;
  /** Render function to render the content of group cells */
  readonly renderGroupCell?: Maybe<(props: RenderGroupCellProps<TRow, TSummaryRow>) => ReactNode>;
  /** Render function to render the content of edit cells. When set, the column is automatically set to be editable */
  readonly renderEditCell?: Maybe<(props: RenderEditCellProps<TRow, TSummaryRow>) => ReactNode>;
  /** Enables cell editing. If set and no editor property specified, then a textinput will be used as the cell editor */
  readonly editable?: Maybe<boolean | ((row: TRow) => boolean)>;
  readonly colSpan?: Maybe<(args: ColSpanArgs<TRow, TSummaryRow>) => Maybe<number>>;
  /** Determines whether column is frozen */
  readonly frozen?: Maybe<boolean>;
  /** Enable resizing of the column */
  readonly resizable?: Maybe<boolean>;
  /** Enable sorting of the column */
  readonly sortable?: Maybe<boolean>;
  /** Enable dragging of the column */
  readonly draggable?: Maybe<boolean>;
  /** Sets the column sort order to be descending instead of ascending the first time the column is sorted */
  readonly sortDescendingFirst?: Maybe<boolean>;
  /**
   * Whether the column can receive keyboard focus.
   * When false, Tab and Arrow keys skip this column.
   * @default true
   */
  readonly focusable?: Maybe<boolean>;
  /**
   * Column visibility. Boolean or breakpoint-based.
   * @example visible: true
   * @example visible: { max: 'sm' }  // Mobile only
   * @example visible: { min: 'md' }  // Desktop only
   * @default true
   */
  readonly visible?: Maybe<ColumnVisibility>;
  /**
   * Mobile rendering behavior.
   * - undefined: Normal column behavior
   * - 'sub': Hidden on mobile, rendered in expandable sub-row
   */
  readonly mobileRole?: Maybe<'sub'>;
  /**
   * Custom label for sub-row display (defaults to column name).
   * Only used when mobileRole is 'sub'.
   */
  readonly mobileLabel?: Maybe<string>;
  /** Options for cell editing */
  readonly editorOptions?: Maybe<{
    /**
     * Render the cell content in addition to the edit cell content.
     * Enable this option when the editor is rendered outside the grid, like a modal for example.
     * By default, the cell content is not rendered when the edit cell is open.
     * @default false
     */
    readonly displayCellContent?: Maybe<boolean>;
    /**
     * Commit changes when clicking outside the cell
     * @default true
     */
    readonly commitOnOutsideClick?: Maybe<boolean>;
    /**
     * Close the editor when the row value changes externally
     * @default true
     */
    readonly closeOnExternalRowChange?: Maybe<boolean>;
  }>;
}

export interface CalculatedColumn<TRow, TSummaryRow = unknown> extends Column<TRow, TSummaryRow> {
  readonly parent: CalculatedColumnParent<TRow, TSummaryRow> | undefined;
  readonly idx: number;
  readonly level: number;
  readonly width: number | string;
  readonly minWidth: number;
  readonly maxWidth: number | undefined;
  readonly resizable: boolean;
  readonly sortable: boolean;
  readonly draggable: boolean;
  readonly frozen: boolean;
  readonly focusable: boolean;
  readonly renderCell: (props: RenderCellProps<TRow, TSummaryRow>) => ReactNode;
  readonly renderHeaderCell: (props: RenderHeaderCellProps<TRow, TSummaryRow>) => ReactNode;
}

export interface ColumnGroup<R, SR = unknown> {
  /** The name of the column group, it will be displayed in the header cell */
  readonly name: string | ReactElement;
  readonly headerCellClass?: Maybe<string>;
  readonly children: readonly ColumnOrColumnGroup<R, SR>[];
}

export interface CalculatedColumnParent<R, SR> {
  readonly name: string | ReactElement;
  readonly parent: CalculatedColumnParent<R, SR> | undefined;
  readonly idx: number;
  readonly colSpan: number;
  readonly level: number;
  readonly headerCellClass?: Maybe<string>;
}

export type ColumnOrColumnGroup<R, SR = unknown> = Column<R, SR> | ColumnGroup<R, SR>;

export type CalculatedColumnOrColumnGroup<R, SR> = CalculatedColumnParent<R, SR> | CalculatedColumn<R, SR>;

export interface RenderCellProps<TRow, TSummaryRow = unknown> {
  column: CalculatedColumn<TRow, TSummaryRow>;
  row: TRow;
  rowIdx: number;
  isCellEditable: boolean;
  tabIndex: number;
  onRowChange: (row: TRow) => void;
}

export interface RenderSummaryCellProps<TSummaryRow, TRow = unknown> {
  column: CalculatedColumn<TRow, TSummaryRow>;
  row: TSummaryRow;
  tabIndex: number;
}

export interface RenderGroupCellProps<TRow, TSummaryRow = unknown> {
  groupKey: unknown;
  column: CalculatedColumn<TRow, TSummaryRow>;
  row: GroupRow<TRow>;
  childRows: readonly TRow[];
  isExpanded: boolean;
  tabIndex: number;
  toggleGroup: () => void;
}

export interface RenderEditCellProps<TRow, TSummaryRow = unknown> {
  column: CalculatedColumn<TRow, TSummaryRow>;
  row: TRow;
  rowIdx: number;
  onRowChange: (row: TRow, commitChanges?: boolean) => void;
  onClose: (commitChanges?: boolean, shouldFocusCell?: boolean) => void;
}

export interface RenderHeaderCellProps<TRow, TSummaryRow = unknown> {
  column: CalculatedColumn<TRow, TSummaryRow>;
  sortDirection: SortDirection | undefined;
  priority: number | undefined;
  tabIndex: number;
}

interface BaseCellRendererProps<TRow, TSummaryRow = unknown>
  extends Omit<React.ComponentProps<'div'>, 'children'>,
    Pick<
      DataGridProps<TRow, TSummaryRow>,
      'onCellMouseDown' | 'onCellClick' | 'onCellDoubleClick' | 'onCellContextMenu'
    > {
  rowIdx: number;
  selectCell: (position: Position, options?: SelectCellOptions) => void;
}

export interface CellRendererProps<TRow, TSummaryRow> extends BaseCellRendererProps<TRow, TSummaryRow> {
  column: CalculatedColumn<TRow, TSummaryRow>;
  row: TRow;
  colSpan: number | undefined;
  isDraggedOver: boolean;
  isCellSelected: boolean;
  /** Whether this cell is part of a selected range */
  isInSelectedRange?: boolean;
  /** Range boundary info for styling (only set when isInSelectedRange is true) */
  rangeBoundary?: { isTop: boolean; isBottom: boolean; isLeft: boolean; isRight: boolean };
  onRowChange: (column: CalculatedColumn<TRow, TSummaryRow>, newRow: TRow) => void;
}

export type CellEvent<E extends React.SyntheticEvent<HTMLDivElement>> = E & {
  preventGridDefault: () => void;
  isGridDefaultPrevented: () => boolean;
};

export type CellMouseEvent = CellEvent<React.MouseEvent<HTMLDivElement>>;

export type CellKeyboardEvent = CellEvent<React.KeyboardEvent<HTMLDivElement>>;

export type CellClipboardEvent = React.ClipboardEvent<HTMLDivElement>;

export interface CellMouseArgs<TRow, TSummaryRow = unknown> {
  column: CalculatedColumn<TRow, TSummaryRow>;
  row: TRow;
  rowIdx: number;
  selectCell: (enableEditor?: boolean) => void;
}

interface SelectCellKeyDownArgs<TRow, TSummaryRow = unknown> {
  mode: 'SELECT';
  column: CalculatedColumn<TRow, TSummaryRow>;
  row: TRow;
  rowIdx: number;
  selectCell: (position: Position, options?: SelectCellOptions) => void;
}

export interface EditCellKeyDownArgs<TRow, TSummaryRow = unknown> {
  mode: 'EDIT';
  column: CalculatedColumn<TRow, TSummaryRow>;
  row: TRow;
  rowIdx: number;
  navigate: () => void;
  onClose: (commitChanges?: boolean, shouldFocusCell?: boolean) => void;
}

export type CellKeyDownArgs<TRow, TSummaryRow = unknown> =
  | SelectCellKeyDownArgs<TRow, TSummaryRow>
  | EditCellKeyDownArgs<TRow, TSummaryRow>;

export interface CellSelectArgs<TRow, TSummaryRow = unknown> {
  rowIdx: number;
  row: TRow | undefined;
  column: CalculatedColumn<TRow, TSummaryRow>;
}

export type CellMouseEventHandler<R, SR> = Maybe<
  (args: CellMouseArgs<NoInfer<R>, NoInfer<SR>>, event: CellMouseEvent) => void
>;

export interface BaseRenderRowProps<TRow, TSummaryRow = unknown> extends BaseCellRendererProps<TRow, TSummaryRow> {
  viewportColumns: readonly CalculatedColumn<TRow, TSummaryRow>[];
  rowIdx: number;
  selectedCellIdx: number | undefined;
  isRowSelectionDisabled: boolean;
  isRowSelected: boolean;
  gridRowStart: number;
}

export interface RenderRowProps<TRow, TSummaryRow = unknown> extends BaseRenderRowProps<TRow, TSummaryRow> {
  row: TRow;
  lastFrozenColumnIndex: number;
  draggedOverCellIdx: number | undefined;
  selectedCellEditor: ReactElement<RenderEditCellProps<TRow>> | undefined;
  onRowChange: (column: CalculatedColumn<TRow, TSummaryRow>, rowIdx: number, newRow: TRow) => void;
  rowClass: Maybe<(row: TRow, rowIdx: number) => Maybe<string>>;
  /** Current cell range for range selection styling */
  selectedCellRange?: CellRange | null;
  /** Columns to render in mobile sub-row (when mobileRole: 'sub') */
  subColumns?: readonly CalculatedColumn<TRow, TSummaryRow>[];
  /** Whether this row is expanded (for mobile sub-rows) */
  isRowExpanded?: boolean;
  /** Callback to toggle row expansion */
  onToggleRowExpand?: (rowIdx: number) => void;
}

export interface RowsChangeData<R, SR = unknown> {
  indexes: number[];
  column: CalculatedColumn<R, SR>;
}

export interface SelectRowEvent<TRow> {
  row: TRow;
  checked: boolean;
  isShiftClick: boolean;
}

export interface SelectHeaderRowEvent {
  checked: boolean;
}

export interface FillEvent<TRow> {
  columnKey: string;
  sourceRow: TRow;
  targetRow: TRow;
}

interface CellCopyPasteArgs<TRow, TSummaryRow = unknown> {
  column: CalculatedColumn<TRow, TSummaryRow>;
  row: TRow;
  rowIdx: number;
}

export interface CellCopyArgs<TRow, TSummaryRow = unknown> extends CellCopyPasteArgs<TRow, TSummaryRow> {
  /** The value being copied */
  value: unknown;
}

export interface CellPasteArgs<TRow, TSummaryRow = unknown> extends CellCopyPasteArgs<TRow, TSummaryRow> {
  /** The pasted text value */
  pastedValue: string;
}

export interface GroupRow<TRow> {
  readonly childRows: readonly TRow[];
  readonly id: string;
  readonly parentId: unknown;
  readonly groupKey: unknown;
  readonly isExpanded: boolean;
  readonly level: number;
  readonly posInSet: number;
  readonly setSize: number;
  readonly startRowIndex: number;
}

export interface SortColumn {
  readonly columnKey: string;
  readonly direction: SortDirection;
}

export type CellNavigationMode = 'NONE' | 'CHANGE_ROW';
export type SortDirection = 'ASC' | 'DESC';

export type ColSpanArgs<TRow, TSummaryRow> =
  | { type: 'HEADER' }
  | { type: 'ROW'; row: TRow }
  | { type: 'SUMMARY'; row: TSummaryRow };

export type RowHeightArgs<TRow> = { type: 'ROW'; row: TRow } | { type: 'GROUP'; row: GroupRow<TRow> };

export interface RenderSortIconProps {
  sortDirection: SortDirection | undefined;
}

export interface RenderSortPriorityProps {
  priority: number | undefined;
}

export interface RenderSortStatusProps extends RenderSortIconProps, RenderSortPriorityProps {}

export interface RenderCheckboxProps
  extends Pick<React.ComponentProps<'input'>, 'aria-label' | 'aria-labelledby' | 'checked' | 'tabIndex' | 'disabled'> {
  indeterminate?: boolean | undefined;
  onChange: (checked: boolean, shift: boolean) => void;
}

export interface Renderers<TRow, TSummaryRow> {
  renderCell?: Maybe<(key: Key, props: CellRendererProps<TRow, TSummaryRow>) => ReactNode>;
  renderCheckbox?: Maybe<(props: RenderCheckboxProps) => ReactNode>;
  renderRow?: Maybe<(key: Key, props: RenderRowProps<TRow, TSummaryRow>) => ReactNode>;
  renderSortStatus?: Maybe<(props: RenderSortStatusProps) => ReactNode>;
  noRowsFallback?: Maybe<ReactNode>;
}

export interface SelectCellOptions {
  enableEditor?: Maybe<boolean>;
  shouldFocusCell?: Maybe<boolean>;
}

export interface ColumnWidth {
  readonly type: 'resized' | 'measured';
  readonly width: number;
}

export type ColumnWidths = ReadonlyMap<string, ColumnWidth>;

export type Direction = 'ltr' | 'rtl';

/**
 * Selection mode for the data grid.
 * - 'none': No selection, no cell focus, keyboard navigation disabled
 * - 'cell': Single cell focus only (keyboard nav, no row selection)
 * - 'cell-range': Multi-cell range selection (Shift+Click/Arrow)
 * - 'row': Single row selection + cell focus
 * - 'row-multi': Multiple row selection + cell focus (default)
 */
export type SelectionMode = 'none' | 'cell' | 'cell-range' | 'row' | 'row-multi';

/**
 * Touch/mobile mode configuration.
 * Can be boolean or breakpoint-based auto-detection.
 */
export type TouchModeConfig = boolean | { max: BreakpointKey } | { min: BreakpointKey };

/**
 * Mobile sub-row configuration.
 * Can be boolean or breakpoint-based auto-detection.
 */
export type MobileSubRowConfig = boolean | { max: BreakpointKey };

export type ResizedWidth = number | 'max-content';
