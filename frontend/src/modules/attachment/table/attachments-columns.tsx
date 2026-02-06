import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Attachment } from '~/api.gen';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { CopyUrlCell, DownloadCell, EllipsisCell, ThumbnailCell } from '~/modules/attachment/table/cells';
import { formatBytes } from '~/modules/attachment/table/helpers';
import { SyncStatusCell } from '~/modules/attachment/table/sync-status-cell';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import HeaderCell from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { ContextEntityData } from '~/modules/entities/types';
import { Input } from '~/modules/ui/input';
import { UserCellById } from '~/modules/user/user-cell';
import { dateShort } from '~/utils/date-short';

export const useColumns = (entity: ContextEntityData, isSheet: boolean, isCompact: boolean) => {
  const { t } = useTranslation();

  const isMobile = useBreakpoints('max', 'sm', false);
  // Use can.update if available, fallback to role check for backwards compatibility
  const canUpdate = entity.can?.update ?? false;

  const columns: ColumnOrColumnGroup<Attachment>[] = useMemo(
    () => [
      CheckboxColumn,
      {
        key: 'thumbnail',
        name: '',
        visible: true,
        sortable: false,
        width: 32,
        renderCell: ({ row, tabIndex }) => <ThumbnailCell row={row} tabIndex={tabIndex} />,
      },
      {
        key: 'name',
        name: t('common:name'),
        editable: true,
        visible: true,
        sortable: true,
        resizable: true,
        minWidth: 180,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => <span className="font-medium">{row.name || '-'}</span>,
        ...(canUpdate && {
          renderEditCell: ({ row, onRowChange }) => (
            <Input value={row.name} onChange={(e) => onRowChange({ ...row, name: e.target.value })} autoFocus />
          ),
        }),
      },
      {
        key: 'uploadStatus',
        name: '',
        visible: true,
        sortable: false,
        width: 32,
        renderCell: ({ row }) => <SyncStatusCell row={row} />,
      },
      {
        key: 'url',
        name: '',
        visible: !isMobile,
        sortable: false,
        width: 32,
        renderCell: ({ row, tabIndex }) => <CopyUrlCell row={row} tabIndex={tabIndex} />,
      },
      {
        key: 'download',
        name: '',
        visible: !isMobile,
        sortable: false,
        width: 32,
        renderCell: ({ row, tabIndex }) => <DownloadCell row={row} tabIndex={tabIndex} />,
      },
      {
        key: 'ellipsis',
        name: '',
        visible: isMobile,
        sortable: false,
        width: 32,
        renderCell: ({ row, tabIndex }) => <EllipsisCell row={row} tabIndex={tabIndex} />,
      },
      {
        key: 'filename',
        name: t('common:filename'),
        visible: !isMobile,
        sortable: false,
        resizable: true,
        minWidth: 140,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (
          <span className="group-hover:underline underline-offset-4 truncate font-light">
            {row.filename || <span className="text-muted">-</span>}
          </span>
        ),
      },
      {
        key: 'size',
        name: t('common:size'),
        sortable: true,
        resizable: true,
        visible: !isMobile,
        minWidth: 100,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (
          <div className="inline-flex items-center gap-1 relative font-light group h-full w-full opacity-50">
            {formatBytes(row.size)}
          </div>
        ),
      },
      {
        key: 'createdAt',
        name: t('common:created_at'),
        sortable: true,
        visible: !isSheet && !isMobile,
        minWidth: 160,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (row.createdAt ? dateShort(row.createdAt) : <span className="text-muted">-</span>),
      },
      {
        key: 'createdBy',
        name: t('common:created_by'),
        sortable: false,
        visible: false,
        minWidth: isCompact ? null : 120,
        width: isCompact ? 50 : null,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row, tabIndex }) => (
          <UserCellById userId={row.createdBy} cacheOnly={false} tabIndex={tabIndex} />
        ),
      },
      {
        key: 'modifiedAt',
        name: t('common:modified'),
        sortable: false,
        visible: false,
        minWidth: 160,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (row.modifiedAt ? dateShort(row.modifiedAt) : <span className="text-muted">-</span>),
      },
      {
        key: 'modifiedBy',
        name: t('common:modified_by'),
        sortable: false,
        visible: false,
        width: isCompact ? 80 : 120,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row, tabIndex }) => (
          <UserCellById userId={row.modifiedBy} cacheOnly={true} tabIndex={tabIndex} />
        ),
      },
    ],
    [t, isMobile, isSheet, isCompact, canUpdate],
  );

  return columns;
};
