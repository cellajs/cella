import { exportDate } from '~/lib/export';
import type { BreakpointKey } from '~/modules/common/data-grid/types';
import { type EllipsisOption, TableEllipsis } from '~/modules/common/data-table/table-ellipsis';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { dateShort } from '~/utils/date-short';

type DateValue = string | Date | null | undefined;

interface DateColumnOptions<T> {
  name: string;
  /** Sortable date columns list newest first on the first sort. Defaults to true. */
  sortable?: boolean;
  hidden?: boolean;
  /** Reads the date; defaults to the row field named by the column key. */
  get?: (row: T) => DateValue;
}

/** A short relative date, hidden below md; exports write the full date. */
export const dateColumn = <T,>(
  key: string,
  { name, sortable = true, hidden, get = (row) => (row as Record<string, DateValue>)[key] }: DateColumnOptions<T>,
): ColumnOrColumnGroup<T> => ({
  key,
  name,
  ...(sortable && { sortable, sortDescendingFirst: true }),
  hidden,
  minBreakpoint: 'md',
  minWidth: 120,
  placeholderValue: '-',
  renderCell: ({ row }) => dateShort(get(row)),
  exportValue: (row) => exportDate(get(row)),
});

interface EmailColumnOptions {
  name: string;
  minBreakpoint?: BreakpointKey;
  resizable?: boolean;
}

/** The address as a mailto link; a row without one shows the placeholder. */
export const emailColumn = <T extends { email?: string | null }>(options: EmailColumnOptions): ColumnOrColumnGroup<T> => ({
  key: 'email',
  minWidth: 140,
  placeholderValue: '-',
  ...options,
  renderCell: ({ row, tabIndex }) =>
    row.email ? (
      <a
        href={`mailto:${row.email}`}
        tabIndex={tabIndex}
        className="active:press link-decoration active:link-decoration-strong truncate opacity-80 outline-0 ring-0 hover:underline hover:opacity-100"
      >
        {row.email}
      </a>
    ) : null,
});

/** Row actions behind an ellipsis button; a row without options gets an empty cell. */
export const ellipsisColumn = <T extends { id: string }>(
  getOptions: (row: T) => EllipsisOption<T>[],
  maxBreakpoint?: BreakpointKey,
): ColumnOrColumnGroup<T> => ({
  key: 'ellipsis',
  name: '',
  ...(maxBreakpoint && { maxBreakpoint }),
  width: 32,
  renderCell: ({ row, tabIndex }) => {
    const options = getOptions(row);
    return options.length ? <TableEllipsis row={row} tabIndex={tabIndex} options={options} /> : null;
  },
});
