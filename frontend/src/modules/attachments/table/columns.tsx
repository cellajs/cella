import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { appConfig } from 'config';
import i18n from 'i18next';
import { CloudIcon, CloudOffIcon, CopyCheckIcon, CopyIcon, DownloadIcon, TrashIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useDownloader from 'react-use-downloader';
import { type Attachment, getPresignedUrl } from '~/api.gen';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import DeleteAttachments from '~/modules/attachments/delete-attachments';
import { formatBytes } from '~/modules/attachments/table/helpers';
import AttachmentPreview from '~/modules/attachments/table/preview';
import { isLocalAttachment } from '~/modules/attachments/utils';
import CheckboxColumn from '~/modules/common/data-table/checkbox-column';
import HeaderCell from '~/modules/common/data-table/header-cell';
import TableEllipsis, { type EllipsisOption } from '~/modules/common/data-table/table-ellipsis';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { PopConfirm } from '~/modules/common/popconfirm';
import Spinner from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/service';
import type { ContextEntityData } from '~/modules/entities/types';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';
import { UserCellById } from '~/modules/users/user-cell';
import { useUserStore } from '~/store/user';
import { dateShort } from '~/utils/date-short';

export const useColumns = (entity: ContextEntityData, isSheet: boolean, isCompact: boolean) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const storeUserSystemRole = useUserStore((state) => state.systemRole);
  const setTriggerRef = useDialoger((state) => state.setTriggerRef);

  const isMobile = useBreakpoints('max', 'sm', false);
  const isAdmin = entity.membership?.role === 'admin' || storeUserSystemRole === 'admin';

  const columns: ColumnOrColumnGroup<Attachment>[] = [
    CheckboxColumn,
    {
      key: 'thumbnail',
      name: '',
      visible: true,
      sortable: false,
      width: 32,
      renderCell: async ({
        row: { id, filename, contentType, thumbnailKey, public: isPublic, originalKey, groupId },
        tabIndex,
      }) => {
        const cellRef = useRef<HTMLAnchorElement | null>(null);

        const wrapClass = 'flex space-x-2 items-center justify-center w-full h-full';

        const key = thumbnailKey || originalKey;

        // For files that are NOT blob URLs → just render preview, no link wrap
        if (isLocalAttachment(key)) {
          return (
            <div className={wrapClass}>
              <AttachmentPreview name={filename} url={key} contentType={contentType} />
            </div>
          );
        }

        // The computed URL for preview and link
        const { data: url } = useQuery({
          queryKey: ['presigned-url', key, isPublic],
          queryFn: () => getPresignedUrl({ query: { key, isPublic } }),
        });
        // Blob URLs: wrap in a Link with custom behavior
        return (
          <Link
            to={url}
            ref={cellRef}
            draggable="false"
            tabIndex={tabIndex}
            className={wrapClass}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) return; // allow new tab
              e.preventDefault();

              // Store focus anchor
              setTriggerRef(id, cellRef);

              navigate({
                to: '.',
                replace: false,
                resetScroll: false,
                search: (prev) => ({
                  ...prev,
                  attachmentDialogId: id,
                  groupId: groupId || undefined,
                }),
              });
            }}
          >
            <AttachmentPreview name={filename} url={url} contentType={contentType} />
          </Link>
        );
      },
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
      ...(isAdmin && {
        renderEditCell: ({ row, onRowChange }) => (
          <Input value={row.name} onChange={(e) => onRowChange({ ...row, name: e.target.value })} autoFocus />
        ),
      }),
    },
    {
      key: 'storeType',
      name: '',
      visible: true,
      sortable: false,
      width: 32,
      renderCell: ({ row }) => {
        const key = row.thumbnailKey || row.originalKey;
        const isLocal = isLocalAttachment(key);

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
      key: 'url',
      name: '',
      visible: !isMobile,
      sortable: false,
      width: 32,
      renderCell: ({ row, tabIndex }) => {
        const { copyToClipboard, copied } = useCopyToClipboard();

        const key = row.thumbnailKey || row.originalKey;
        const isLocal = isLocalAttachment(key);

        if (isLocal) return <div className="text-muted text-center w-full">-</div>;

        const shareLink = `${appConfig.backendUrl}/${row.organizationId}/attachments/${row.id}/link`;
        return (
          <Button
            variant="cell"
            size="icon"
            tabIndex={tabIndex}
            className="h-full w-full"
            aria-label="Copy"
            data-tooltip="true"
            data-tooltip-content={copied ? t('common:copied') : t('common:copy')}
            onClick={() => copyToClipboard(shareLink)}
          >
            {copied ? <CopyCheckIcon size={16} /> : <CopyIcon size={16} />}
          </Button>
        );
      },
    },
    {
      key: 'download',
      name: '',
      visible: !isMobile,
      sortable: false,
      width: 32,
      renderCell: ({ row, tabIndex }) => {
        const { download, isInProgress } = useDownloader();

        const key = row.thumbnailKey || row.originalKey;
        const isLocal = isLocalAttachment(key);

        if (isLocal) return <div className="text-muted text-center w-full">-</div>;
        return (
          <Button
            variant="cell"
            size="icon"
            tabIndex={tabIndex}
            disabled={isInProgress}
            className="h-full w-full"
            aria-label="Download"
            data-tooltip="true"
            data-tooltip-content={t('common:download')}
            onClick={() =>
              getPresignedUrl({ query: { key: row.originalKey, isPublic: row.public } }).then((url) =>
                download(url, row.filename),
              )
            }
          >
            {isInProgress ? <Spinner className="size-4 text-foreground/80" noDelay /> : <DownloadIcon size={16} />}
          </Button>
        );
      },
    },
    {
      key: 'ellipsis',
      name: '',
      visible: isMobile,
      sortable: false,
      width: 32,
      renderCell: ({ row, tabIndex }) => {
        const { copyToClipboard } = useCopyToClipboard();

        const key = row.thumbnailKey || row.originalKey;
        const isLocal = isLocalAttachment(key);

        if (isLocal) return <div className="text-muted text-center w-full">-</div>;

        const ellipsisOptions: EllipsisOption<Attachment>[] = [
          {
            label: i18n.t('common:delete'),
            icon: TrashIcon,
            onSelect: (row) => {
              const { update } = useDropdowner.getState();
              const callback = () => useDropdowner.getState().remove();

              update({
                content: (
                  <PopConfirm title={i18n.t('common:delete_confirm.text', { name: row.name })}>
                    <DeleteAttachments attachments={[row]} callback={callback} />
                  </PopConfirm>
                ),
              });
            },
          },
        ];

        if (!isLocal) {
          const shareLink = `${appConfig.backendUrl}/${row.organizationId}/attachments/${row.id}/link`;

          ellipsisOptions.push({
            label: i18n.t('common:copy_url'),
            icon: CopyIcon,
            onSelect: () => {
              copyToClipboard(shareLink);
              toaster(t('common:success.copy_url'), 'success');
              useDropdowner.getState().remove();
            },
          });
        }

        return <TableEllipsis row={row} tabIndex={tabIndex} options={ellipsisOptions} />;
      },
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
      renderCell: ({ row, tabIndex }) => <UserCellById userId={row.createdBy} cacheOnly={false} tabIndex={tabIndex} />,
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
      renderCell: ({ row, tabIndex }) => <UserCellById userId={row.modifiedBy} cacheOnly={true} tabIndex={tabIndex} />,
    },
  ];

  return columns;
};
