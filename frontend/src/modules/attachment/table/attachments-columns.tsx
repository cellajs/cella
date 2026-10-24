import { TrashIcon, UserIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Attachment } from 'sdk';
import { appConfig, hierarchy, seenWindowMs } from 'shared';
import { DeleteAttachments } from '~/modules/attachment/delete-attachments';
import { DownloadCell, ThumbnailCell } from '~/modules/attachment/table/attachment-cells';
import { DescriptionCell, openDescriptionSheetFromCell } from '~/modules/attachment/table/description-cell';
import { EditCellInput, externalEditorOptions, RenderExternalEditor } from '~/modules/common/data-grid/cell-renderers';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import { dateColumn, ellipsisColumn } from '~/modules/common/data-table/columns';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { dropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { NamedText } from '~/modules/common/named-text';
import { openPopConfirm } from '~/modules/common/popconfirm';
import type { EnrichedChannel } from '~/modules/entities/types';
import { useResolveCan } from '~/modules/entities/use-resolve-can';
import { SeenMark } from '~/modules/seen/seen-mark';
import { ActorCell } from '~/modules/user/actor-cell';
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

/** Per-row delete: 'own' resolves against the row's creator, 'home' against the row's placement. */
export const useCanDeleteAttachment = (channel: EnrichedChannel) => {
  const resolveCan = useResolveCan();
  return (row: Attachment) =>
    resolveCan(channel.can?.attachment?.delete, row.createdBy, { row: hierarchy.resolveDeepestAncestorId('attachment', row), channel: channel.id });
};

export const useColumns = (channel: EnrichedChannel, isSheet: boolean): ColumnOrColumnGroup<Attachment>[] => {
  const { t } = useTranslation();

  // Table editing covers unconditional, owner and home-scoped grants; the backend resolves them per row.
  const canUpdate = !!channel.can?.attachment?.update;
  const canDelete = useCanDeleteAttachment(channel);

  return [
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
          <SeenMark productId={row.id} tenantId={row.tenantId} organizationId={row.organizationId} channelId={channel.id} productType="attachment" />
          <span className="truncate font-medium">{row.name || '-'}</span>
        </>
      ),
      // For 'own' policies the backend enforces the final owner check on save.
      ...(canUpdate && {
        renderEditCell: ({ row, onRowChange }) => (
          <EditCellInput value={row.name} onChange={(event) => onRowChange({ ...row, name: event.target.value })} autoFocus />
        ),
      }),
    },
    {
      key: 'description',
      name: t('c:description'),
      minBreakpoint: 'md',
      resizable: true,
      minWidth: 200,
      placeholderValue: '-',
      renderCell: ({ row, isCellEditable }) => <DescriptionCell row={row} editable={isCellEditable} />,
      // The editor is the description sheet: entering edit mode opens it and leaves edit mode again.
      ...(canUpdate && {
        editorOptions: externalEditorOptions,
        renderEditCell: ({ row, onClose }) => <RenderExternalEditor onClose={onClose} open={(cell) => openDescriptionSheetFromCell(row.id, cell)} />,
      }),
    },
    {
      key: 'download',
      name: '',
      minBreakpoint: 'md',
      width: 32,
      renderCell: ({ row, tabIndex }) => <DownloadCell row={row} tabIndex={tabIndex} />,
    },
    // Delete is the only row action, so a row the user cannot delete gets no menu.
    ellipsisColumn<Attachment>((row) => {
      if (!canDelete(row)) return [];

      return [
        {
          label: t('c:delete'),
          icon: TrashIcon,
          variant: 'destructive',
          onSelect: (row) => {
            const { remove } = dropdowner.getState();
            openPopConfirm(
              <NamedText i18nKey="c:delete_confirm.text" name={row.name} />,
              <DeleteAttachments attachments={[row]} callback={remove} onCancel={remove} />,
            );
          },
        },
      ];
    }, 'sm'),
    {
      key: 'filename',
      name: t('c:filename'),
      minBreakpoint: 'md',
      resizable: true,
      minWidth: 140,
      placeholderValue: '-',
      renderCell: ({ row }) => (row.filename ? <span className="truncate">{row.filename}</span> : null),
    },
    {
      key: 'size',
      name: t('c:size'),
      minBreakpoint: 'md',
      width: 100,
      renderCell: ({ row }) => <span className="text-muted-foreground">{formatBytes(row.size)}</span>,
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
            className="inline-flex size-full items-center gap-2"
            {...(outsideSeenWindow && {
              'data-tooltip': 'true',
              'data-tooltip-content': t('c:views_retention_hint', { days: appConfig.retention.activityDays }),
            })}
          >
            <UserIcon className="text-muted-foreground/70" />
            <span className={cn(outsideSeenWindow && 'text-muted-foreground')}>{row.viewCount ?? 0}</span>
          </span>
        );
      },
    },
    dateColumn('createdAt', { name: t('c:created_at'), hidden: isSheet }),
    {
      key: 'createdBy',
      name: t('c:created_by'),
      hidden: true,
      minWidth: 160,
      placeholderValue: '-',
      renderCell: ({ row, tabIndex }) => row.createdBy && <ActorCell compactable actor={row.createdBy} tabIndex={tabIndex} />,
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
      renderCell: ({ row, tabIndex }) => row.updatedBy && <ActorCell compactable actor={row.updatedBy} tabIndex={tabIndex} />,
    },
  ];
};
