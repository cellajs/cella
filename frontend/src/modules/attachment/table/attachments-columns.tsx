import { useTranslation } from 'react-i18next';
import type { Attachment } from '~/api.gen';
import { DownloadCell, EllipsisCell, ThumbnailCell } from '~/modules/attachment/table/cells';
import { formatBytes } from '~/modules/attachment/table/helpers';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { EnrichedContextEntity } from '~/modules/entities/types';
import { SeenMark } from '~/modules/seen/seen-mark';
import { Input } from '~/modules/ui/input';
import { UserCell } from '~/modules/user/user-cell';
import { dateShort } from '~/utils/date-short';

export const useColumns = (contextEntity: EnrichedContextEntity, isSheet: boolean, isCompact: boolean) => {
  const { t } = useTranslation();

  // Attachment permission state from the parent context entity.
  // Can be `true` (admin: update any), `'own'` (member: update own), or `false` (denied).
  const canUpdateState = contextEntity.can?.attachment?.update ?? false;

  // Whether to enable edit UI at the column level (true for both unconditional and owner-scoped)
  // TODO review
  const canUpdate = canUpdateState === true || canUpdateState === 'own';

  const columns: ColumnOrColumnGroup<Attachment>[] = [
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
      // Enable inline editing when user has update permission (unconditional or owner-scoped).
      // For 'own' policies, the backend enforces the final owner check on save.
      ...(canUpdate && {
        renderEditCell: ({ row, onRowChange }) => (
          <Input value={row.name} onChange={(e) => onRowChange({ ...row, name: e.target.value })} autoFocus />
        ),
      }),
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
      resizable: true,
      minWidth: 140,
      renderCell: ({ row }) => (
        <span className="group-hover:underline underline-offset-4 truncate font-light">
          {row.filename || <span className="text-muted">-</span>}
        </span>
      ),
    },
    {
      key: 'size',
      name: t('common:size'),
      minBreakpoint: 'md',
      width: 100,
      renderCell: ({ row }) => (
        <div className="inline-flex items-center gap-1 relative font-light group h-full w-full opacity-50">
          {formatBytes(row.size)}
        </div>
      ),
    },
    {
      key: 'viewCount',
      name: t('common:views'),
      hidden: isSheet,
      minBreakpoint: 'md',
      width: 100,
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
      minWidth: 120,
      placeholderValue: '-',
      renderCell: ({ row }) => dateShort(row.createdAt),
    },
    {
      key: 'createdBy',
      name: t('common:created_by'),
      hidden: true,
      minWidth: isCompact ? null : 160,
      width: isCompact ? 50 : null,
      placeholderValue: '-',
      renderCell: ({ row, tabIndex }) =>
        row.createdBy && <UserCell compactable user={row.createdBy} tabIndex={tabIndex} />,
    },
    {
      key: 'modifiedAt',
      name: t('common:modified'),
      hidden: true,
      minWidth: 120,
      placeholderValue: '-',
      renderCell: ({ row }) => dateShort(row.modifiedAt),
    },
    {
      key: 'modifiedBy',
      name: t('common:modified_by'),
      hidden: true,
      width: isCompact ? 80 : 160,
      placeholderValue: '-',
      renderCell: ({ row, tabIndex }) =>
        row.modifiedBy && <UserCell compactable user={row.modifiedBy} tabIndex={tabIndex} />,
    },
  ];

  return columns;
};
