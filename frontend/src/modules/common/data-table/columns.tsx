import { BoxIcon } from 'lucide-react';
import { exportDate } from '~/lib/export';
import type { BreakpointKey } from '~/modules/common/data-grid/types';
import { type EllipsisOption, TableEllipsis } from '~/modules/common/data-table/table-ellipsis';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { IconComponent } from '~/modules/common/icons/types';
import { dateShort } from '~/utils/date-short';
import { formatCount } from '~/utils/format-count';

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

interface CountColumnOptions<T> {
  name: string;
  /** Defaults to a box. */
  icon?: IconComponent;
  hidden?: boolean;
  get: (row: T) => number | null | undefined;
}

/** A compact count behind an icon, hidden below md; hover and exports give the exact number. */
export const countColumn = <T,>(key: string, { name, icon: Icon = BoxIcon, hidden, get }: CountColumnOptions<T>): ColumnOrColumnGroup<T> => ({
  key,
  name,
  hidden,
  minBreakpoint: 'md',
  minWidth: 60,
  maxWidth: 120,
  renderCell: ({ row }) => {
    const count = get(row);
    const text = typeof count === 'number' ? formatCount(count) : '-';
    const isAbbreviated = typeof count === 'number' && text !== String(count);

    return (
      <>
        <Icon className="mr-2 opacity-50" />
        <span {...(isAbbreviated && { 'data-tooltip': 'true', 'data-tooltip-content': count })}>{text}</span>
      </>
    );
  },
  exportValue: get,
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
