import { UserIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Attachment } from 'sdk';
import { resolvePermission, seenWindowMs } from 'shared';
import { DownloadCell, EllipsisCell, ThumbnailCell } from '~/modules/attachment/table/attachment-cells';
import { EditCellInput } from '~/modules/common/data-grid/cell-renderers';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { EnrichedChannel } from '~/modules/entities/types';
import { SeenMark } from '~/modules/seen/seen-mark';
import { UserCell } from '~/modules/user/user-cell';
import { useUserStore } from '~/modules/user/user-store';
import { cn } from '~/utils/cn';
import { dateShort } from '~/utils/date-short';
import { formatBytes } from '~/utils/format-bytes';

/** Views are only counted inside the unseen-count retention window; older rows read 0. */
const isOutsideSeenWindow = (createdAt: string | null | undefined) => {
  if (!createdAt) return false;

  const createdTime = new Date(createdAt).getTime();
  if (Number.isNaN(createdTime)) return false;

  return Date.now() - createdTime > seenWindowMs;
};

export const useColumns = (channel: EnrichedChannel, isSheet: boolean) => {
  const { t } = useTranslation();

  // Deliberately optimistic and table-scoped: `!!` enables inline edit for both `true` (admin) and
  // `'own'` because there is no single row here to resolve it against. The backend enforces the
  // owner check per row on save. Per-entity affordances resolve `'own'` via
  // `useResolveCan` (~/modules/entities/use-resolve-can); this table-level case is the exception.
  const canUpdate = !!channel.can?.attachment?.update;

  // Per-row delete resolves 'own' against the row's creator (resolvePermission is what
  // useResolveCan wraps; used directly here so the memo can depend on plain values).
  const deleteState = channel.can?.attachment?.delete;
  const userId = useUserStore((state) => state.user?.id);

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
              productId={row.id}
              tenantId={channel.tenantId}
              organizationId={channel.id}
              productType="attachment"
            />
            <span className="truncate font-medium">{row.name || '-'}</span>
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
        renderCell: ({ row, tabIndex }) => (
          <EllipsisCell
            row={row}
            tabIndex={tabIndex}
            canDelete={resolvePermission(deleteState, row.createdBy?.id ?? null, userId)}
          />
        ),
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
        renderCell: ({ row }) => {
          const outsideSeenWindow = isOutsideSeenWindow(row.createdAt);

          return (
            <span
              className="inline-flex h-full w-full items-center"
              data-tooltip={outsideSeenWindow ? 'true' : undefined}
              data-tooltip-content={outsideSeenWindow ? t('c:views_retention_hint') : undefined}
            >
              <UserIcon className="mr-2 opacity-50" />
              <span className={cn(outsideSeenWindow && 'text-muted-foreground/60')}>{row.viewCount ?? 0}</span>
            </span>
          );
        },
      },
      {
        key: 'createdAt',
        name: t('c:created_at'),
        sortable: true,
        sortDescendingFirst: true,
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
        name: t('c:updated'),
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
    [canUpdate, deleteState, userId, isSheet],
  );

  return columns;
};
