import { useTranslation } from 'react-i18next';
import { exportDate } from '~/lib/export';
import type { BreakpointKey } from '~/modules/common/data-grid/types';
import { type EllipsisOption, TableEllipsis } from '~/modules/common/data-table/table-ellipsis';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { dateShort } from '~/utils/date-short';

type DateValue = string | Date | null | undefined;

interface DateColumnOptions<T> {
  name: string;
  /** Defaults to true. */
  sortable?: boolean;
  /** The first sort lists the newest date first. Defaults to true; false for a date that reads forward, such as a deadline. */
  newestFirst?: boolean;
  /** The width the column shows from; null shows it at every width. Defaults to 'md'. */
  minBreakpoint?: BreakpointKey | null;
  hidden?: boolean;
  /** Reads the date; defaults to the row field named by the column key. */
  get?: (row: T) => DateValue;
}

/** A short relative date, hidden below md unless told otherwise; exports write the full date. */
export const dateColumn = <T,>(
  key: string,
  {
    name,
    sortable = true,
    newestFirst = true,
    minBreakpoint = 'md',
    hidden,
    get = (row) => (row as Record<string, DateValue>)[key],
  }: DateColumnOptions<T>,
): ColumnOrColumnGroup<T> => ({
  key,
  name,
  ...(sortable && { sortable, ...(newestFirst && { sortDescendingFirst: true }) }),
  hidden,
  ...(minBreakpoint && { minBreakpoint }),
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

/** The header of the row actions column: a name for assistive technology, nothing to see. */
function EllipsisColumnHeader() {
  const { t } = useTranslation();
  return <span className="sr-only">{t('c:actions')}</span>;
}

/** Row actions behind an ellipsis button; a row without options gets an empty cell. */
export const ellipsisColumn = <T extends { id: string }>(
  getOptions: (row: T) => EllipsisOption<T>[],
  maxBreakpoint?: BreakpointKey,
): ColumnOrColumnGroup<T> => ({
  key: 'ellipsis',
  name: '',
  ...(maxBreakpoint && { maxBreakpoint }),
  width: 32,
  renderHeaderCell: () => <EllipsisColumnHeader />,
  renderCell: ({ row, tabIndex }) => {
    const options = getOptions(row);
    return options.length ? <TableEllipsis row={row} tabIndex={tabIndex} options={options} /> : null;
  },
});
