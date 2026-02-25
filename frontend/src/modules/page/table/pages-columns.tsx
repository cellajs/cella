import { Link } from '@tanstack/react-router';
import { CloudIcon, CloudOffIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Page } from '~/api.gen';
import { zPage } from '~/api.gen/zod.gen';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import { HeaderCell } from '~/modules/common/data-table/header-cell';
import { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import { UserCell } from '~/modules/user/user-cell';
import { dateShort } from '~/utils/date-short';

const pageStatuses = zPage.shape.status.options;

/** Check if a page is local-only (not yet synced to server) */
function isLocalPage(page: Page) {
  return '_optimistic' in page;
}

/**
 * Builds column definitions for the pages table.
 */
export function usePagesTableColumns(isCompact: boolean) {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm', false);

  const configs: ColumnOrColumnGroup<Page>[] = [
    CheckboxColumn,
    {
      key: 'name',
      name: t('common:title'),
      visible: true,
      minWidth: 200,
      sortable: false,
      resizable: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => (
        <Link
          to="/docs/page/$id"
          tabIndex={tabIndex}
          params={{ id: row.id }}
          className="flex space-x-2 items-center outline-0 ring-0 group"
        >
          <span className="group-hover:underline underline-offset-3 decoration-foreground/20 group-active:decoration-foreground/50 group-active:translate-y-[.05rem] truncate font-medium">
            {row.name}
          </span>
        </Link>
      ),
    },
    {
      key: 'syncStatus',
      name: '',
      visible: true,
      sortable: false,
      width: 32,
      renderCell: ({ row }) => {
        const isLocal = isLocalPage(row);
        return (
          <div
            className="flex justify-center items-center h-full w-full"
            data-tooltip="true"
            data-tooltip-content={isLocal ? t('common:local_only') : t('common:online')}
          >
            {isLocal ? (
              <CloudOffIcon className="opacity-50" size={16} />
            ) : (
              <CloudIcon className="text-success" size={16} />
            )}
          </div>
        );
      },
    },
    {
      key: 'status',
      name: t('common:status'),
      editable: true,
      visible: !isMobile,
      sortable: false,
      resizable: true,
      width: 160,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => {
        return <span className="font-light">{t(`app:${row.status}`)}</span>;
      },
      renderEditCell: ({ row, onRowChange }) => {
        const { t } = useTranslation();

        const onChooseValue = (value: string) => {
          setTimeout(() => onRowChange({ ...row, status: value as Page['status'] }, true));
        };

        return (
          <Select open={true} value={row.status} onValueChange={onChooseValue}>
            <SelectTrigger className="h-8 border-none p-2 text-xs tracking-wider">
              <SelectValue placeholder={row.status} />
            </SelectTrigger>
            <SelectContent sideOffset={-41} alignOffset={-5} className="duration-0!">
              {pageStatuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {t(`app:${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
    {
      key: 'createdBy',
      name: t('common:created_by'),
      sortable: false,
      visible: true,
      resizable: true,
      minWidth: isCompact ? null : 120,
      width: isCompact ? 50 : null,
      renderHeaderCell: HeaderCell,
      // TODO revisit user cell since often no avatar
      renderCell: ({ row, tabIndex }) =>
        row.createdBy ? (
          <UserCell compactable user={row.createdBy} tabIndex={tabIndex} />
        ) : (
          <span className="text-muted">-</span>
        ),
    },
    {
      key: 'createdAt',
      name: t('common:created_at'),
      sortable: false,
      visible: !isMobile,
      resizable: true,
      minWidth: 160,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (row.createdAt ? dateShort(row.createdAt) : <span className="text-muted">-</span>),
    },
  ];

  const [columns, setColumns] = useState(configs);

  return {
    columns,
    visibleColumns: columns.filter((column) => column.visible),
    setColumns,
  };
}
