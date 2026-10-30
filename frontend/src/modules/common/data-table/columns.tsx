import { BoxIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { exportDate } from '~/lib/export';
import type { TKey } from '~/lib/i18n-locales';
import type { BreakpointKey } from '~/modules/common/data-grid/types';
import { type EllipsisOption, type EllipsisRow, TableEllipsis } from '~/modules/common/data-table/table-ellipsis';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { IconComponent } from '~/modules/common/icons/types';
import { MiddleCut } from '~/modules/common/middle-cut';
import { dateShort } from '~/utils/date-short';
import { formatCount } from '~/utils/format-count';
import { tw } from '~/utils/tw';

/** The label inside a `cell` Button: a link underline on hover, darker while the button is held. */
export const cellLinkTextClass = tw('link-decoration group-active/cell-button:link-decoration-strong truncate group-hover/cell-button:underline');

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
  cellClass: 'gap-2',
  renderCell: ({ row }) => {
    const count = get(row);
    const text = typeof count === 'number' ? formatCount(count) : '-';
    const isAbbreviated = typeof count === 'number' && text !== String(count);

    return (
      <>
        <Icon className="opacity-50" />
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
        draggable={false}
        className="active:press link-decoration active:link-decoration-strong truncate outline-0 hover:underline"
      >
        <MiddleCut text={row.email} />
      </a>
    ) : null,
});

interface SrOnlyHeaderProps {
  label: TKey;
}

/** A column header for assistive technology only, over a column of controls that need no visible title. */
export function SrOnlyHeader({ label }: SrOnlyHeaderProps) {
  const { t } = useTranslation();
  return <span className="sr-only">{t(label)}</span>;
}

/** Row actions behind an ellipsis button; a row without options gets an empty cell. */
export const ellipsisColumn = <T extends EllipsisRow>(
  getOptions: (row: T) => EllipsisOption<T>[],
  maxBreakpoint?: BreakpointKey,
): ColumnOrColumnGroup<T> => ({
  key: 'ellipsis',
  name: '',
  ...(maxBreakpoint && { maxBreakpoint }),
  width: 32,
  // The whole cell marks the row whose menu is open, padding included
  cellClass: 'has-data-dropdowner-active:bg-muted',
  renderHeaderCell: () => <SrOnlyHeader label="c:actions" />,
  renderCell: ({ row, tabIndex }) => {
    const options = getOptions(row);
    return options.length ? <TableEllipsis row={row} tabIndex={tabIndex} options={options} /> : null;
  },
});
