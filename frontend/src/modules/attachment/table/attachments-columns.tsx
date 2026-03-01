import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Attachment } from '~/api.gen';
import {
  CopyUrlCell,
  DownloadCell,
  EllipsisCell,
  PublicAccessCell,
  ThumbnailCell,
} from '~/modules/attachment/table/cells';
import { formatBytes } from '~/modules/attachment/table/helpers';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import { HeaderCell } from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { EnrichedContextEntity } from '~/modules/entities/types';
import { SeenMark } from '~/modules/seen/seen-mark';
import { Input } from '~/modules/ui/input';
import { UserCell } from '~/modules/user/user-cell';
import { dateShort } from '~/utils/date-short';

export const useColumns = (contextEntity: EnrichedContextEntity, isSheet: boolean, isCompact: boolean) => {
  const { t } = useTranslation();

  // Check attachment permissions on the parent context entity
  const canUpdate = contextEntity.can?.attachment?.update ?? false;

  const columns: ColumnOrColumnGroup<Attachment>[] = useMemo(
    () => [
      CheckboxColumn,
      {
        key: 'thumbnail',
        name: '',
        sortable: false,
        width: 32,
        renderCell: ({ row, tabIndex }) => <ThumbnailCell row={row} tabIndex={tabIndex} />,
      },
      {
        key: 'name',
        name: t('common:name'),
        editable: true,
        sortable: true,
        resizable: true,
        minWidth: 180,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (
          <>
            <SeenMark
              entityId={row.id}
              tenantId={contextEntity.tenantId}
              orgId={contextEntity.id}
              entityType="attachment"
            />
            <span className="font-medium">{row.name || '-'}</span>
          </>
        ),
        ...(canUpdate && {
          renderEditCell: ({ row, onRowChange }) => (
            <Input value={row.name} onChange={(e) => onRowChange({ ...row, name: e.target.value })} autoFocus />
          ),
        }),
      },
      {
        key: 'publicAccess',
        name: '',
        sortable: false,
        width: 32,
        renderCell: ({ row, tabIndex }) => <PublicAccessCell row={row} tabIndex={tabIndex} canUpdate={canUpdate} />,
      },
      {
        key: 'url',
        name: '',
        minBreakpoint: 'md',
        sortable: false,
        width: 32,
        renderCell: ({ row, tabIndex }) => <CopyUrlCell row={row} tabIndex={tabIndex} />,
      },
      {
        key: 'download',
        name: '',
        minBreakpoint: 'md',
        sortable: false,
        width: 32,
        renderCell: ({ row, tabIndex }) => <DownloadCell row={row} tabIndex={tabIndex} />,
      },
      {
        key: 'ellipsis',
        name: '',
        maxBreakpoint: 'sm',
        sortable: false,
        width: 32,
        renderCell: ({ row, tabIndex }) => <EllipsisCell row={row} tabIndex={tabIndex} />,
      },
      {
        key: 'filename',
        name: t('common:filename'),
        minBreakpoint: 'md',
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
        minBreakpoint: 'md',
        minWidth: 80,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (
          <div className="inline-flex items-center gap-1 relative font-light group h-full w-full opacity-50">
            {formatBytes(row.size)}
          </div>
        ),
      },
      {
        key: 'viewCount',
        name: t('common:views'),
        sortable: false,
        hidden: isSheet,
        minBreakpoint: 'md',
        minWidth: 80,
        renderHeaderCell: HeaderCell,
        renderCell: ({ row }) => (
          <div className="inline-flex items-center gap-1 relative font-light group h-full w-full opacity-50">
            {row.viewCount ?? 0}
          </div>
        ),
      },
      {
        key: 'createdAt',
        name: t('common:created_at'),
        sortable: true,
        hidden: isSheet,
        minBreakpoint: 'md',
        minWidth: 160,
        renderHeaderCell: HeaderCell,
        placeholderValue: '-',
        renderCell: ({ row }) => dateShort(row.createdAt),
      },
      {
        key: 'createdBy',
        name: t('common:created_by'),
        sortable: false,
        hidden: true,
        minWidth: isCompact ? null : 120,
        width: isCompact ? 50 : null,
        renderHeaderCell: HeaderCell,
        placeholderValue: '-',
        renderCell: ({ row, tabIndex }) =>
          row.createdBy && <UserCell compactable user={row.createdBy} tabIndex={tabIndex} />,
      },
      {
        key: 'modifiedAt',
        name: t('common:modified'),
        sortable: false,
        hidden: true,
        minWidth: 160,
        renderHeaderCell: HeaderCell,
        placeholderValue: '-',
        renderCell: ({ row }) => dateShort(row.modifiedAt),
      },
      {
        key: 'modifiedBy',
        name: t('common:modified_by'),
        sortable: false,
        hidden: true,
        width: isCompact ? 80 : 120,
        renderHeaderCell: HeaderCell,
        placeholderValue: '-',
        renderCell: ({ row, tabIndex }) =>
          row.modifiedBy && <UserCell compactable user={row.modifiedBy} tabIndex={tabIndex} />,
      },
    ],
    [t, isSheet, isCompact, canUpdate, contextEntity.tenantId, contextEntity.id],
  );

  return columns;
};
