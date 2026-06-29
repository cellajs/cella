import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Attachment } from 'sdk';
import { DownloadCell, EllipsisCell, ThumbnailCell } from '~/modules/attachment/table/cells';
import { formatBytes } from '~/modules/attachment/table/helpers';
import { EditCellInput } from '~/modules/common/data-grid/cell-renderers';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { EnrichedContextEntity } from '~/modules/entities/types';
import { SeenMark } from '~/modules/seen/seen-mark';
import { UserCell } from '~/modules/user/user-cell';
import { dateShort } from '~/utils/date-short';

export const useColumns = (contextEntity: EnrichedContextEntity, isSheet: boolean) => {
  const { t } = useTranslation();

  // Enable inline edit when user has update permission (`true` admin, or `'own'` owner-scoped).
  // For `'own'`, the backend enforces the final owner check on save.
  const canUpdate = !!contextEntity.can?.attachment?.update;

  const columns: ColumnOrColumnGroup<Attachment>[] = useMemo(
    () => [
      CheckboxColumn,
      {
        key: 'thumbnail',
        name: '',
        width: 32,
        renderCell: ({ row, tabIndex }) => <ThumbnailCell row={row} tabIndex={tabIndex} />,
      },
      {
        key: 'name',
        name: t('c:name'),
        editable: true,
        sortable: true,
        resizable: true,
        minWidth: 180,
        renderCell: ({ row }) => (
          <>
            <SeenMark
              entityId={row.id}
              tenantId={contextEntity.tenantId}
              organizationId={contextEntity.id}
              entityType="attachment"
            />
            <span className="font-medium">{row.name || '-'}</span>
          </>
        ),
        // Enable inline editing when user has update permission (unconditional or owner-scoped).
        // For 'own' policies, the backend enforces the final owner check on save.
        ...(canUpdate && {
          renderEditCell: ({ row, onRowChange }) => (
            <EditCellInput value={row.name} onChange={(e) => onRowChange({ ...row, name: e.target.value })} autoFocus />
          ),
        }),
      },
      {
        key: 'download',
        name: '',
        minBreakpoint: 'md',
        width: 32,
        renderCell: ({ row, tabIndex }) => <DownloadCell row={row} tabIndex={tabIndex} />,
      },
      {
        key: 'ellipsis',
        name: '',
        maxBreakpoint: 'sm',
        width: 32,
        renderCell: ({ row, tabIndex }) => <EllipsisCell row={row} tabIndex={tabIndex} />,
      },
      {
        key: 'filename',
        name: t('c:filename'),
        minBreakpoint: 'md',
        resizable: true,
        minWidth: 140,
        renderCell: ({ row }) => (
          <span className="truncate underline-offset-4 group-hover:underline">
            {row.filename || <span className="text-muted">-</span>}
          </span>
        ),
      },
      {
        key: 'size',
        name: t('c:size'),
        minBreakpoint: 'md',
        width: 100,
        renderCell: ({ row }) => (
          <div className="group relative inline-flex h-full w-full items-center gap-1 opacity-50">
            {formatBytes(row.size)}
          </div>
        ),
      },
      {
        key: 'viewCount',
        name: t('c:views'),
        hidden: isSheet,
        minBreakpoint: 'md',
        width: 100,
        renderCell: ({ row }) => (
          <div className="group relative inline-flex h-full w-full items-center gap-1 opacity-50">
            {row.viewCount ?? 0}
          </div>
        ),
      },
      {
        key: 'createdAt',
        name: t('c:created_at'),
        sortable: true,
        hidden: isSheet,
        minBreakpoint: 'md',
        minWidth: 120,
        placeholderValue: '-',
        renderCell: ({ row }) => dateShort(row.createdAt),
      },
      {
        key: 'createdBy',
        name: t('c:created_by'),
        hidden: true,
        minWidth: 160,
        placeholderValue: '-',
        renderCell: ({ row, tabIndex }) =>
          row.createdBy && <UserCell compactable user={row.createdBy} tabIndex={tabIndex} />,
      },
      {
        key: 'updatedAt',
        name: t('c:modified'),
        hidden: true,
        minWidth: 120,
        placeholderValue: '-',
        renderCell: ({ row }) => dateShort(row.updatedAt),
      },
      {
        key: 'updatedBy',
        name: t('c:updated_by'),
        hidden: true,
        width: 160,
        placeholderValue: '-',
        renderCell: ({ row, tabIndex }) =>
          row.updatedBy && <UserCell compactable user={row.updatedBy} tabIndex={tabIndex} />,
      },
    ],
    [canUpdate, isSheet],
  );

  return columns;
};
