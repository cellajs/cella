import { TrashIcon, UserIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Attachment } from 'sdk';
import { appConfig, isSeenTracked, seenWindowMs } from 'shared';
import { DeleteAttachments } from '~/modules/attachment/delete-attachments';
import { DescriptionCell, DownloadCell, openDescriptionSheetFromCell, ThumbnailCell } from '~/modules/attachment/table/attachment-cells';
import { EditCellInput, externalEditorOptions, RenderExternalEditor } from '~/modules/common/data-grid/cell-renderers';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import { dateColumn, ellipsisColumn } from '~/modules/common/data-table/columns';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { HighlightText, MatchReason } from '~/modules/common/match-highlight/highlight-text';
import { MiddleCut } from '~/modules/common/middle-cut';
import { DeleteQuestion } from '~/modules/common/popconfirm';
import type { EnrichedChannel } from '~/modules/entities/types';
import { useCan } from '~/modules/entities/use-can';
import { SeenMark } from '~/modules/seen/seen-mark';
import { ActorCell } from '~/modules/user/actor-cell';
import { cn } from '~/utils/cn';
import { formatBytes } from '~/utils/format-bytes';

const viewsTracked = isSeenTracked('attachment');

/** Views are only counted inside the unseen-count retention window; older rows read 0. */
const isOutsideSeenWindow = (createdAt: string | null | undefined) => {
  if (!createdAt) return false;

  const createdTime = new Date(createdAt).getTime();
  if (Number.isNaN(createdTime)) return false;

  return Date.now() - createdTime > seenWindowMs;
};

export const useColumns = (channel: EnrichedChannel): ColumnOrColumnGroup<Attachment>[] => {
  const { t } = useTranslation();

  const can = useCan();
  const canUpdate = (row: Attachment) => can('update', 'attachment', row);

  const viewsColumn: ColumnOrColumnGroup<Attachment> = {
    key: 'viewCount',
    name: t('c:views'),
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
          <UserIcon className="text-faint-foreground" />
          <span className={cn(outsideSeenWindow && 'text-muted-foreground')}>{row.viewCount ?? 0}</span>
        </span>
      );
    },
  };

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
      editable: canUpdate,
      sortable: true,
      resizable: true,
      minWidth: 180,
      renderCell: ({ row }) => (
        <>
          {viewsTracked && (
            <SeenMark
              productId={row.id}
              tenantId={row.tenantId}
              organizationId={row.organizationId}
              channelId={channel.id}
              productType="attachment"
            />
          )}
          <span className="min-w-0">
            <span className="block truncate font-medium">
              <HighlightText text={row.name || '-'} />
            </span>
            <MatchReason text={row.filename} shownText={row.name} />
          </span>
        </>
      ),
      renderEditCell: ({ row, column, onRowChange }) => (
        <EditCellInput name={column.key} value={row.name} onChange={(event) => onRowChange({ ...row, name: event.target.value })} autoFocus />
      ),
    },
    {
      key: 'description',
      name: t('c:description'),
      minBreakpoint: 'md',
      resizable: true,
      minWidth: 200,
      placeholderValue: '-',
      renderCell: ({ row, isCellEditable }) => <DescriptionCell row={row} editable={isCellEditable} />,
      editable: canUpdate,
      // The editor is the description sheet: entering edit mode opens it and leaves edit mode again.
      editorOptions: externalEditorOptions,
      renderEditCell: ({ row, onClose }) => <RenderExternalEditor onClose={onClose} open={(cell) => openDescriptionSheetFromCell(row.id, cell)} />,
    },
    {
      key: 'download',
      name: '',
      width: 32,
      renderCell: ({ row, tabIndex }) => <DownloadCell row={row} tabIndex={tabIndex} />,
    },
    // Delete is the only row action, so a row the user cannot delete gets no menu.
    ellipsisColumn<Attachment>((row) => {
      if (!can('delete', 'attachment', row)) return [];

      return [
        {
          label: t('c:delete'),
          icon: TrashIcon,
          variant: 'destructive',
          confirm: (row) => ({
            title: <DeleteQuestion resource="c:attachment" name={row.name} />,
            content: <DeleteAttachments attachments={[row]} />,
          }),
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
      renderCell: ({ row }) => (row.filename ? <MiddleCut text={row.filename} /> : null),
    },
    {
      key: 'size',
      name: t('c:size'),
      minBreakpoint: 'md',
      width: 100,
      renderCell: ({ row }) => <span className="text-muted-foreground">{formatBytes(row.size)}</span>,
    },
    ...(viewsTracked ? [viewsColumn] : []),
    dateColumn('createdAt', { name: t('c:created_at') }),
    {
      key: 'createdBy',
      name: t('c:created_by'),
      hidden: true,
      minWidth: 160,
      placeholderValue: '-',
      renderCell: ({ row, tabIndex }) => row.createdBy && <ActorCell compactable actor={row.createdBy} tabIndex={tabIndex} />,
    },
    dateColumn('updatedAt', { name: t('c:updated'), hidden: true, sortable: false, minBreakpoint: null }),
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
