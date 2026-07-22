import type { Key, ReactElement, ReactNode } from 'react';

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type Maybe<T> = T | undefined | null;

/** Supported breakpoint keys for responsive features */
export type BreakpointKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/** Placement of a merged column relative to the host cell content (Base UI positioning vocabulary) */
export type TileSide = 'top' | 'right' | 'bottom' | 'left';

/** Column display modes; mobile overrides compact properties when both are active. */
export type GridMode = 'compact' | 'mobile';

/** Which display modes are currently active */
export type ActiveModes = Readonly<Record<GridMode, boolean>>;

/**
 * Merge this column into another column's cell while a mode is active.
 * The column stops being a grid column (no track, no header, no cell focus)
 * and renders its `renderCell` output inside the host cell.
 */
export interface ColumnMergeRule {
  /** Key of the host column to merge into. Must resolve to a non-merged, currently visible column. */
  readonly into: string;
  /** Placement relative to the host cell content */
  readonly side: TileSide;
  /** Ordering among columns merged to the same side (lower first; ties keep column order) */
  readonly order?: Maybe<number>;
  /** Class name(s) for the slot wrapper inside the host cell */
  readonly className?: Maybe<string>;
}

/** Per-column overrides applied while the given display mode is active */
export interface ColumnModeOverrides {
  /** Width override while this mode is active */
  readonly width?: Maybe<number | string>;
  /** Minimum width override while this mode is active */
  readonly minWidth?: Maybe<number>;
  /** Maximum width override while this mode is active */
  readonly maxWidth?: Maybe<number>;
  /** Merge this column into a host cell while this mode is active */
  readonly merge?: Maybe<ColumnMergeRule>;
}

/** A column merged into a host cell, plus its slot wrapper class */
export interface MergedSlot<TRow, TSummaryRow = unknown> {
  readonly column: CalculatedColumn<TRow, TSummaryRow>;
  readonly className?: Maybe<string>;
}

/** Columns merged into a host cell, grouped by placement side */
export type MergedSlots<TRow, TSummaryRow = unknown> = Readonly<
  Record<TileSide, readonly MergedSlot<TRow, TSummaryRow>[]>
>;

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
  /** Reactively exclude this column independently of breakpoint visibility. */
  readonly hidden?: boolean;
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

  /** Render function to render the content of cells */
  readonly renderCell?: Maybe<(props: RenderCellProps<TRow, TSummaryRow>) => ReactNode>;
  /** Render function to render the content of the header cell */
  readonly renderHeaderCell?: Maybe<(props: RenderHeaderCellProps<TRow, TSummaryRow>) => ReactNode>;

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
  /** Mark cells as row drag sources; drop targets remain active on every column. */
  readonly rowDragHandle?: Maybe<boolean>;
  /** Sets descending as the column's initial sort order. */
  readonly sortDescendingFirst?: Maybe<boolean>;
  /**
   * Muted-text placeholder shown only when `renderCell` returns null/undefined.
   * @example placeholderValue: '-'
   */
  readonly placeholderValue?: Maybe<string>;
  /** When false, Tab and Arrow keys skip this column (no keyboard focus). @default true */
  readonly focusable?: Maybe<boolean>;
  /**
   * Below this breakpoint the column is excluded. Evaluated against the grid's
   * internal breakpoint; keep this static.
   * @example minBreakpoint: 'md'  // Hidden on xs, sm
   */
  readonly minBreakpoint?: BreakpointKey;
  /**
   * Above this breakpoint the column is excluded.
   * @example maxBreakpoint: 'sm'  // Only visible on xs, sm (mobile-only)
   */
  readonly maxBreakpoint?: BreakpointKey;

  /** Wrap to a numeric line cap or effectively unlimited lines, expanding beyond base row height. */
  readonly wrapText?: Maybe<number | boolean>;
  /** Overrides the default newline-counting heuristic for variable row height. */
  readonly estimateLines?: (row: TRow) => number;
  /**
   * Override widths or merge into a host per display mode; mobile properties win over compact.
   * Missing hosts disable their merge and restore normal visibility.
   */
  readonly modes?: Maybe<Partial<Record<GridMode, ColumnModeOverrides>>>;
  /** Options for cell editing */
  readonly editorOptions?: Maybe<{
    /** Select a text or picker cursor for the cell editor affordance. */
    readonly editorType?: Maybe<'text' | 'select'>;
    /**
     * Also render the cell content while editing. Enable when the editor renders
     * outside the grid (e.g. a modal/popover). @default false (content hidden while editing)
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
  /**
   * Columns merged into this column's cells via an active mode merge rule (§`modes`).
   * Only set on host columns; merged columns themselves are excluded from the grid's columns.
   */
  readonly mergedSlots?: Maybe<MergedSlots<TRow, TSummaryRow>>;
}

export interface ColumnGroup<R, SR = unknown> {
  /** The name of the column group, it will be displayed in the header cell */
  readonly name: string | ReactElement;
  readonly headerCellClass?: Maybe<string>;
  readonly children: readonly ColumnOrColumnGroup<R, SR>[];
  /** Reactive hide flag; see {@link Column.hidden}. When true the whole group is excluded. */
  readonly hidden?: boolean;
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

interface BaseCellRendererProps<TRow, TSummaryRow = unknown> extends Omit<React.ComponentProps<'div'>, 'children'> {
  onCellMouseDown?: CellMouseEventHandler<TRow, TSummaryRow>;
  onCellClick?: CellMouseEventHandler<TRow, TSummaryRow>;
  onCellDoubleClick?: CellMouseEventHandler<TRow, TSummaryRow>;
  onCellContextMenu?: CellMouseEventHandler<TRow, TSummaryRow>;
  rowIdx: number;
  selectCell: (position: Position, options?: SelectCellOptions) => void;
  /**
   * Enables cell selection + the cell-level roving tab index. When false, the
   * gridcell wrapper drops out of the tab order and interactive children
   * (buttons, links) fall back to natural DOM tab order.
   */
  isCellSelectionEnabled: boolean;
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
  selectedCellEditor: ReactElement<RenderEditCellProps<TRow>> | undefined;
  onRowChange: (column: CalculatedColumn<TRow, TSummaryRow>, rowIdx: number, newRow: TRow) => void;
  rowClass: Maybe<(row: TRow, rowIdx: number) => Maybe<string>>;
  /** Render function for individual cells */
  renderCell: (key: Key, props: CellRendererProps<TRow, TSummaryRow>) => ReactNode;
  /** Current cell range for range selection styling */
  selectedCellRange?: CellRange | null;
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
  renderRow?: Maybe<(key: Key, props: RenderRowProps<TRow, TSummaryRow>) => ReactNode>;
  noRowsFallback?: Maybe<ReactNode>;
}

export interface SelectCellOptions {
  enableEditor?: Maybe<boolean>;
  shouldFocusCell?: Maybe<boolean>;
  extendSelection?: Maybe<boolean>;
}

export interface ColumnWidth {
  readonly type: 'resized' | 'measured';
  readonly width: number;
}

export type ColumnWidths = ReadonlyMap<string, ColumnWidth>;

/** Cell focus mode: disabled, one navigable cell, or a Shift-extended copy/paste range. */
export type CellSelectionMode = 'none' | 'cell' | 'cell-range';

/** Row-body selection: disabled, replacement single-select, or toggle/range multi-select. */
export type RowSelectionMode = 'none' | 'single' | 'multi';

export type ResizedWidth = number | 'max-content';

export type DefaultColumnOptions<R, SR> = Pick<
  Column<R, SR>,
  'renderCell' | 'renderHeaderCell' | 'width' | 'minWidth' | 'maxWidth' | 'resizable' | 'sortable' | 'draggable'
>;
