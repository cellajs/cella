import { Link, useNavigate } from '@tanstack/react-router';
import i18n from 'i18next';
import {
  AlertCircleIcon,
  CloudOffIcon,
  CopyCheckIcon,
  CopyIcon,
  DownloadIcon,
  LoaderIcon,
  LockKeyholeIcon,
  LockKeyholeOpenIcon,
  TrashIcon,
  UploadCloudIcon,
} from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useDownloader from 'react-use-downloader';
import { appConfig } from 'shared';
import type { Attachment } from '~/api.gen';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { AttachmentPreview } from '~/modules/attachment/attachment-preview';
import { DeleteAttachments } from '~/modules/attachment/delete-attachments';
import { getFileUrl } from '~/modules/attachment/helpers';
import { useAttachmentUrl } from '~/modules/attachment/hooks/use-attachment-url';
import { useBlobUploadStatus } from '~/modules/attachment/hooks/use-blob-sync-status';
import { useAttachmentUpdateMutation } from '~/modules/attachment/query';
import type { EllipsisOption } from '~/modules/common/data-table/table-ellipsis';
import { TableEllipsis } from '~/modules/common/data-table/table-ellipsis';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { PopConfirm } from '~/modules/common/popconfirm';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/service';
import { Button } from '~/modules/ui/button';

interface ThumbnailCellProps {
  row: Attachment;
  tabIndex: number;
}

export const ThumbnailCell = ({ row, tabIndex }: ThumbnailCellProps) => {
  const { id, filename, contentType, groupId } = row;
  const navigate = useNavigate();
  const setTriggerRef = useDialoger((state) => state.setTriggerRef);
  const cellRef = useRef<HTMLAnchorElement | null>(null);

  const wrapClass = 'relative flex space-x-2 items-center justify-center w-full h-full';

  // Use attachment URL hook - prefer thumbnail variant for table cells
  const { url, isLocal } = useAttachmentUrl(row, { preferredVariant: 'thumbnail' });

  const handleClick = (e: React.MouseEvent) => {
    // For non-local URLs, allow cmd/ctrl+click to open in new tab
    if (!isLocal && (e.metaKey || e.ctrlKey)) return;
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
  };

  const preview = <AttachmentPreview name={filename} url={url ?? undefined} contentType={contentType} />;
  const badge = <SyncStatusBadge attachmentId={id} />;

  // Use regular anchor for blob URLs (local) since TanStack Router blocks blob: protocol
  // For remote URLs, use Link for proper router integration
  if (isLocal) {
    return (
      <a
        ref={cellRef}
        href={url ?? undefined}
        draggable="false"
        tabIndex={tabIndex}
        className={wrapClass}
        onClick={handleClick}
      >
        {preview}
        {badge}
      </a>
    );
  }

  return (
    <Link
      to={url ?? undefined}
      ref={cellRef}
      draggable="false"
      tabIndex={tabIndex}
      className={wrapClass}
      onClick={handleClick}
    >
      {preview}
      {badge}
    </Link>
  );
};

const SyncStatusBadge = ({ attachmentId }: { attachmentId: string }) => {
  const { t } = useTranslation();
  const { hasLocalBlob, isUploaded, isUploading, isFailed, isPending, isLocalOnly } = useBlobUploadStatus(attachmentId);

  // No local blob or already uploaded — no badge needed
  if (!hasLocalBlob || isUploaded) return null;

  let icon: React.ReactNode;
  let tooltip: string;

  if (isUploading) {
    icon = <LoaderIcon className="text-background animate-spin" size={10} />;
    tooltip = t('common:uploading');
  } else if (isPending) {
    icon = <UploadCloudIcon className="text-background" size={10} />;
    tooltip = t('common:pending_sync');
  } else if (isFailed) {
    icon = <AlertCircleIcon className="text-background" size={10} />;
    tooltip = t('common:upload_failed');
  } else if (isLocalOnly) {
    icon = <CloudOffIcon className="text-background" size={10} />;
    tooltip = t('common:local_only');
  } else {
    return null;
  }

  return (
    <div
      className={`absolute -bottom-0.5 -right-0.5 rounded-full p-0.5 ${isFailed ? 'bg-destructive' : 'bg-muted-foreground'}`}
      data-tooltip="true"
      data-tooltip-content={tooltip}
    >
      {icon}
    </div>
  );
};

interface PublicAccessCellProps {
  row: Attachment;
  tabIndex: number;
  canUpdate: boolean;
}

export const PublicAccessCell = ({ row, tabIndex, canUpdate }: PublicAccessCellProps) => {
  const { t } = useTranslation();
  const updateAttachment = useAttachmentUpdateMutation(row.tenantId, row.organizationId);

  const isPublic = row.publicAccess;

  if (!canUpdate) {
    return (
      <div
        className="flex justify-center items-center h-full w-full"
        data-tooltip="true"
        data-tooltip-content={isPublic ? t('common:public') : t('common:private')}
      >
        {isPublic ? (
          <LockKeyholeOpenIcon className="text-success" size={16} />
        ) : (
          <LockKeyholeIcon className="text-muted-foreground" size={16} />
        )}
      </div>
    );
  }

  return (
    <Button
      variant="cell"
      size="cell"
      tabIndex={tabIndex}
      className="justify-center"
      aria-label={isPublic ? t('common:private') : t('common:public')}
      data-tooltip="true"
      data-tooltip-content={isPublic ? t('common:public') : t('common:private')}
      onClick={() => updateAttachment.mutate({ id: row.id, key: 'publicAccess', data: !isPublic })}
    >
      {isPublic ? (
        <LockKeyholeOpenIcon className="text-success" size={16} />
      ) : (
        <LockKeyholeIcon className="text-muted-foreground" size={16} />
      )}
    </Button>
  );
};

interface CopyUrlCellProps {
  row: Attachment;
  tabIndex: number;
}

export const CopyUrlCell = ({ row, tabIndex }: CopyUrlCellProps) => {
  const { t } = useTranslation();
  const { copyToClipboard, copied } = useCopyToClipboard();

  // Check if blob is uploaded to cloud
  const { isUploaded, hasLocalBlob } = useBlobUploadStatus(row.id);
  const canCopy = !hasLocalBlob || isUploaded;

  if (!canCopy) return <div className="text-muted text-center w-full">-</div>;

  const shareLink = `${appConfig.backendUrl}/${row.tenantId}/${row.organizationId}/attachments/${row.id}/link`;
  return (
    <Button
      variant="cell"
      size="cell"
      tabIndex={tabIndex}
      className="justify-center"
      aria-label="Copy"
      data-tooltip="true"
      data-tooltip-content={copied ? t('common:copied') : t('common:copy')}
      onClick={() => copyToClipboard(shareLink)}
    >
      {copied ? <CopyCheckIcon size={16} /> : <CopyIcon size={16} />}
    </Button>
  );
};

interface DownloadCellProps {
  row: Attachment;
  tabIndex: number;
}

export const DownloadCell = ({ row, tabIndex }: DownloadCellProps) => {
  const { t } = useTranslation();
  const { download, isInProgress } = useDownloader();

  // Check if blob is uploaded to cloud
  const { isUploaded, hasLocalBlob } = useBlobUploadStatus(row.id);
  const canDownload = !hasLocalBlob || isUploaded;

  if (!canDownload) return <div className="text-muted text-center w-full">-</div>;

  return (
    <Button
      variant="cell"
      size="cell"
      tabIndex={tabIndex}
      disabled={isInProgress}
      className="justify-center"
      aria-label="Download"
      data-tooltip="true"
      data-tooltip-content={t('common:download')}
      onClick={() =>
        getFileUrl(row.originalKey, row.public, row.tenantId, row.organizationId)
          .then((url) => download(url, row.filename))
          .catch(() => toaster(t('error:download_failed'), 'error'))
      }
    >
      {isInProgress ? <Spinner className="size-4 text-foreground/80" noDelay /> : <DownloadIcon size={16} />}
    </Button>
  );
};

interface EllipsisCellProps {
  row: Attachment;
  tabIndex: number;
}

export const EllipsisCell = ({ row, tabIndex }: EllipsisCellProps) => {
  const { t } = useTranslation();
  const { copyToClipboard } = useCopyToClipboard();

  // Check if blob is uploaded to cloud
  const { isUploaded, hasLocalBlob } = useBlobUploadStatus(row.id);
  const canShare = !hasLocalBlob || isUploaded;

  // Build options - delete is always available, copy URL only if synced
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

  if (canShare) {
    const shareLink = `${appConfig.backendUrl}/${row.tenantId}/${row.organizationId}/attachments/${row.id}/link`;

    ellipsisOptions.push({
      label: i18n.t('common:copy_url'),
      icon: CopyIcon,
      onSelect: () => {
        copyToClipboard(shareLink);
        toaster(t('common:success.resource_copied', { resource: t('common:url') }), 'success');
        useDropdowner.getState().remove();
      },
    });
  }

  return <TableEllipsis row={row} tabIndex={tabIndex} options={ellipsisOptions} />;
};
