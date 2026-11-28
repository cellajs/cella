import type { Key, ReactElement, ReactNode } from 'react';
import type { IconComponent } from '~/modules/common/icons/types';

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type Maybe<T> = T | undefined | null;

export type BreakpointKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/** Placement of a merged column relative to the host cell content (Base UI positioning vocabulary) */
export type TileSide = 'top' | 'right' | 'bottom' | 'left';

/** Column display modes; mobile overrides compact properties when both are active. */
export type GridMode = 'compact' | 'mobile';

export type ActiveModes = Readonly<Record<GridMode, boolean>>;

/** Merge this column into another column's cell while a mode is active: it leaves the grid (no track, header or focus) and renders inside the host cell. */
export interface ColumnMergeRule {
  /** Key of the host column to merge into. Must resolve to a non-merged, currently visible column. */
  readonly into: string;
  readonly side: TileSide;
  /** Ordering among columns merged to the same side (lower first; ties keep column order) */
  readonly order?: Maybe<number>;
  /** Class name(s) for the slot wrapper inside the host cell */
  readonly className?: Maybe<string>;
  /** Fixed slot width, in pixels or a CSS length: a row without content keeps the space, and the host's header moves past left slots that all set one. */
  readonly width?: Maybe<number | string>;
}

/** Per-column overrides applied while the given display mode is active */
export interface ColumnModeOverrides {
  readonly width?: Maybe<number | string>;
  readonly minWidth?: Maybe<number>;
  readonly maxWidth?: Maybe<number>;
  readonly merge?: Maybe<ColumnMergeRule>;
}

export interface MergedSlot<TRow, TSummaryRow = unknown> {
  readonly column: CalculatedColumn<TRow, TSummaryRow>;
  readonly className?: Maybe<string>;
  readonly width?: Maybe<number | string>;
}

export type MergedSlots<TRow, TSummaryRow = unknown> = Readonly<Record<TileSide, readonly MergedSlot<TRow, TSummaryRow>[]>>;

export interface Position {
  readonly idx: number;
  readonly rowIdx: number;
}

/** Context passed to a column's `estimateLines` callback for width-aware row sizing. */
interface EstimateLinesContext {
  /** The column's rendered width in pixels (flex-resolved, or the declared width). */
  readonly width: number;
}

export interface Column<TRow, TSummaryRow = unknown> {
  /** The name of the column. Displayed in the header cell by default */
  readonly name: string | ReactElement;
  /** Takes the name's place in a header narrower than 6rem; a string name then shows as its tooltip. */
  readonly icon?: Maybe<IconComponent>;
  /** A unique key to distinguish each column */
  readonly key: string;
  /** Reactively exclude this column independently of breakpoint visibility. */
  readonly hidden?: boolean;
  /** Column width; when unset it is determined from the grid width and the widths of the other columns. @default 'auto' */
  readonly width?: Maybe<number | string>;
  /** Minimum column width in pixels. @default 50 */
  readonly minWidth?: Maybe<number>;
  /** Maximum column width in pixels */
  readonly maxWidth?: Maybe<number>;
  readonly cellClass?: Maybe<string | ((row: TRow) => Maybe<string>)>;
  readonly headerCellClass?: Maybe<string>;

  readonly renderCell?: Maybe<(props: RenderCellProps<TRow, TSummaryRow>) => ReactNode>;
  readonly renderHeaderCell?: Maybe<(props: RenderHeaderCellProps<TRow, TSummaryRow>) => ReactNode>;

  /** Renders edit-cell content. Setting it makes the column editable. */
  readonly renderEditCell?: Maybe<(props: RenderEditCellProps<TRow, TSummaryRow>) => ReactNode>;
  /** Enables cell editing; without `renderEditCell` a text input is used. */
  readonly editable?: Maybe<boolean | ((row: TRow) => boolean)>;
  readonly resizable?: Maybe<boolean>;
  readonly sortable?: Maybe<boolean>;
  /** Mark cells as row drag sources; drop targets remain active on every column. */
  readonly rowDragHandle?: Maybe<boolean>;
  readonly sortDescendingFirst?: Maybe<boolean>;
  /** Muted-text placeholder shown only when `renderCell` returns null/undefined. @example placeholderValue: '-' */
  readonly placeholderValue?: Maybe<string>;
  /** When false, Tab and Arrow keys skip this column (no keyboard focus). @default true */
  readonly focusable?: Maybe<boolean>;
  /** Below this breakpoint the column is excluded, judged by the grid's internal breakpoint; keep it static. @example 'md' hides it on xs, sm */
  readonly minBreakpoint?: BreakpointKey;
  /** Above this breakpoint the column is excluded. @example 'sm' shows it on xs and sm only (mobile-only) */
  readonly maxBreakpoint?: BreakpointKey;

  /** Wrap to a numeric line cap or effectively unlimited lines, expanding beyond base row height. */
  readonly wrapText?: Maybe<number | boolean>;
  /** Overrides the newline-counting heuristic for row height; receives the rendered pixel width (see {@link estimateWrappedLines}). */
  readonly estimateLines?: (row: TRow, ctx: EstimateLinesContext) => number;
  /** Per-mode width and merge overrides; mobile wins over compact, and a missing host disables its merge. */
  readonly modes?: Maybe<Partial<Record<GridMode, ColumnModeOverrides>>>;
  readonly editorOptions?: Maybe<{
    /** Select a text or picker cursor for the cell editor affordance. */
    readonly editorType?: Maybe<'text' | 'select'>;
    /** Also render the cell content while editing, for an editor outside the grid (a modal or popover). @default false (hidden while editing) */
    readonly displayCellContent?: Maybe<boolean>;
    /** Commit changes when clicking outside the cell. @default true */
    readonly commitOnOutsideClick?: Maybe<boolean>;
  }>;
}

export interface CalculatedColumn<TRow, TSummaryRow = unknown> extends Column<TRow, TSummaryRow> {
  readonly idx: number;
  readonly width: number | string;
  readonly minWidth: number;
  readonly maxWidth: number | undefined;
  readonly resizable: boolean;
  readonly sortable: boolean;
  readonly focusable: boolean;
  readonly renderCell: (props: RenderCellProps<TRow, TSummaryRow>) => ReactNode;
  readonly renderHeaderCell: (props: RenderHeaderCellProps<TRow, TSummaryRow>) => ReactNode;
  /** Columns merged in by an active `modes` rule. Set only on host columns; merged columns leave the grid's columns. */
  readonly mergedSlots?: Maybe<MergedSlots<TRow, TSummaryRow>>;
}

/** The name apps import column lists by; the grid has no column groups. */
export type ColumnOrColumnGroup<R, SR = unknown> = Column<R, SR>;

export interface RenderCellProps<TRow, TSummaryRow = unknown> {
  column: CalculatedColumn<TRow, TSummaryRow>;
  row: TRow;
  rowIdx: number;
  isCellEditable: boolean;
  /** Pass to every focusable control in the cell: without it each row adds a Tab stop to the grid's single one. */
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
  onCellClick?: CellMouseEventHandler<TRow, TSummaryRow>;
  rowIdx: number;
  selectCell: (position: Position, options?: SelectCellOptions) => void;
}

export interface CellRendererProps<TRow, TSummaryRow> extends BaseCellRendererProps<TRow, TSummaryRow> {
  column: CalculatedColumn<TRow, TSummaryRow>;
  row: TRow;
  isDraggedOver: boolean;
  isCellSelected: boolean;
  onRowChange: (column: CalculatedColumn<TRow, TSummaryRow>, rowIdx: number, newRow: TRow) => void;
}

export type CellEvent<E extends React.SyntheticEvent<HTMLDivElement>> = E & { preventGridDefault: () => void; isGridDefaultPrevented: () => boolean };

export type CellMouseEvent = CellEvent<React.MouseEvent<HTMLDivElement>>;

export interface CellMouseArgs<TRow, TSummaryRow = unknown> {
  column: CalculatedColumn<TRow, TSummaryRow>;
  row: TRow;
  rowIdx: number;
  selectCell: (enableEditor?: boolean) => void;
}

export type CellMouseEventHandler<R, SR> = Maybe<(args: CellMouseArgs<NoInfer<R>, NoInfer<SR>>, event: CellMouseEvent) => void>;

interface BaseRenderRowProps<TRow, TSummaryRow = unknown> extends BaseCellRendererProps<TRow, TSummaryRow> {
  viewportColumns: readonly CalculatedColumn<TRow, TSummaryRow>[];
  rowIdx: number;
  selectedCellIdx: number | undefined;
  isRowSelectionDisabled: boolean;
  isRowSelected: boolean;
  gridRowStart: number;
}

export interface RenderRowProps<TRow, TSummaryRow = unknown> extends BaseRenderRowProps<TRow, TSummaryRow> {
  row: TRow;
  /** Height the grid reserves for the row, in pixels; a row with wrapping text may outgrow it. Readable from a cell as `--rdg-row-height`. */
  height: number;
  /** Animates order changes with a motion layout transition. */
  animateReorder?: boolean;
  selectedCellEditor: ReactElement<RenderEditCellProps<TRow>> | undefined;
  onRowChange: (column: CalculatedColumn<TRow, TSummaryRow>, rowIdx: number, newRow: TRow) => void;
  rowClass: Maybe<(row: TRow, rowIdx: number) => Maybe<string>>;
  renderCell: (key: Key, props: CellRendererProps<TRow, TSummaryRow>) => ReactNode;
}

/** A treegrid row's place in its tree, as the APG treegrid pattern puts it on each row. */
export interface TreeRowAttributes {
  /** 1 for a root row. */
  'aria-level': number;
  /** Whether its child rows show; absent on a row without children. */
  'aria-expanded'?: boolean;
  /** From 1, among the rows with the same parent. */
  'aria-posinset': number;
  'aria-setsize': number;
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

export interface SortColumn {
  readonly columnKey: string;
  readonly direction: SortDirection;
}

export type CellNavigationMode = 'NONE' | 'CHANGE_ROW';
type SortDirection = 'ASC' | 'DESC';

export interface Renderers<TRow, TSummaryRow> {
  renderCell?: Maybe<(key: Key, props: CellRendererProps<TRow, TSummaryRow>) => ReactNode>;
  renderRow?: Maybe<(key: Key, props: RenderRowProps<TRow, TSummaryRow>) => ReactNode>;
  noRowsFallback?: Maybe<ReactNode>;
}

export interface SelectCellOptions {
  enableEditor?: Maybe<boolean>;
  shouldFocusCell?: Maybe<boolean>;
}

/** Pixel widths by column key; a column without an entry takes its declared width. */
export type ColumnWidths = ReadonlyMap<string, number>;

export type ResizedWidth = number | 'max-content';

export type DefaultColumnOptions<R, SR> = Pick<
  Column<R, SR>,
  'renderCell' | 'renderHeaderCell' | 'width' | 'minWidth' | 'maxWidth' | 'resizable' | 'sortable'
>;
