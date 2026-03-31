import { Link } from '@tanstack/react-router';
import { CloudIcon, CloudOffIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Page } from 'sdk';
import { zPage } from 'sdk/zod.gen';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import { UserCell } from '~/modules/user/user-cell';
import { dateShort } from '~/utils/date-short';

const pageStatuses = zPage.shape.status.options;
const pageRenderModes = zPage.shape.renderMode.options;

/** Check if a page is local-only (not yet synced to server) */
function isLocalPage(page: Page) {
  return '_optimistic' in page;
}

/**
 * Builds column definitions for the pages table.
 */
export function usePagesTableColumns(isCompact: boolean) {
  const { t } = useTranslation();

  const configs: ColumnOrColumnGroup<Page>[] = [
    CheckboxColumn,
    {
      key: 'name',
      name: t('common:title'),
      minWidth: 180,

      resizable: true,
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
      minBreakpoint: 'md',

      resizable: true,
      width: 160,
      renderCell: ({ row }) => {
        return <span className="font-light">{t(`common:${row.status}`)}</span>;
      },
      renderEditCell: function StatusEditCell({ row, onRowChange }) {
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
                  {t(`common:${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
    {
      key: 'renderMode',
      name: t('common:render_mode'),
      editable: true,
      minBreakpoint: 'md',

      resizable: true,
      width: 140,
      renderCell: ({ row }) => {
        return (
          <span className="font-light">
            {t(`common:render_mode.${row.renderMode === 'nodeOnly' ? 'node_only' : row.renderMode}`)}
          </span>
        );
      },
      renderEditCell: function RenderModeEditCell({ row, onRowChange }) {
        const { t } = useTranslation();

        const onChooseValue = (value: string) => {
          setTimeout(() => onRowChange({ ...row, renderMode: value as Page['renderMode'] }, true));
        };

        return (
          <Select open={true} value={row.renderMode} onValueChange={onChooseValue}>
            <SelectTrigger className="h-8 border-none p-2 text-xs tracking-wider">
              <SelectValue placeholder={row.renderMode} />
            </SelectTrigger>
            <SelectContent sideOffset={-41} alignOffset={-5} className="duration-0!">
              {pageRenderModes.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {t(`common:render_mode.${mode === 'nodeOnly' ? 'node_only' : mode}`)}
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

      resizable: true,
      minWidth: isCompact ? null : 160,
      width: isCompact ? 50 : null,
      placeholderValue: '-',
      renderCell: ({ row, tabIndex }) =>
        row.createdBy && <UserCell compactable user={row.createdBy} tabIndex={tabIndex} />,
    },
    {
      key: 'createdAt',
      name: t('common:created_at'),

      minBreakpoint: 'md',
      resizable: true,
      minWidth: 120,
      placeholderValue: '-',
      renderCell: ({ row }) => dateShort(row.createdAt),
    },
  ];

  const [columns, setColumns] = useState(configs);

  return {
    columns,
    visibleColumns: columns.filter((column) => !column.hidden),
    setColumns,
  };
}
