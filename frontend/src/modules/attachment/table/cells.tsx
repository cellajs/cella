import { useNavigate } from '@tanstack/react-router';
import i18n from 'i18next';
import { AlertCircleIcon, CloudOffIcon, DownloadIcon, LoaderIcon, TrashIcon, UploadCloudIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useDownloader from 'react-use-downloader';
import type { Attachment } from 'sdk';
import { DeleteAttachments } from '~/modules/attachment/delete-attachments';
import { getFileUrl } from '~/modules/attachment/file-url';
import { useAttachmentUrl } from '~/modules/attachment/hooks/use-attachment-url';
import { useBlobUploadStatus } from '~/modules/attachment/hooks/use-blob-sync-status';
import type { EllipsisOption } from '~/modules/common/data-table/table-ellipsis';
import { TableEllipsis } from '~/modules/common/data-table/table-ellipsis';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { MediaThumbnail } from '~/modules/common/media-thumbnail';
import { PopConfirm } from '~/modules/common/popconfirm';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { Button } from '~/modules/ui/button';

interface ThumbnailCellProps {
  row: Attachment;
  tabIndex: number;
}

export const ThumbnailCell = ({ row, tabIndex }: ThumbnailCellProps) => {
  const { id, filename, contentType, groupId } = row;
  const navigate = useNavigate();
  const setTriggerRef = useDialoger((state) => state.setTriggerRef);
  const cellRef = useRef<HTMLButtonElement | null>(null);

  const wrapClass = 'relative flex space-x-2 items-center justify-center w-full h-full';

  // Use attachment URL hook - prefer thumbnail variant for table cells
  const { url } = useAttachmentUrl(row, { preferredVariant: 'thumbnail' });

  const handleClick = () => {
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

  const preview = <MediaThumbnail name={filename} url={url} contentType={contentType} />;
  const badge = <SyncStatusBadge attachmentId={id} />;

  return (
    <Button ref={cellRef} variant="cell" size="cell" tabIndex={tabIndex} className={wrapClass} onClick={handleClick}>
      {preview}
      {badge}
    </Button>
  );
};

const SyncStatusBadge = ({ attachmentId }: { attachmentId: string }) => {
  const { t } = useTranslation();
  const { hasLocalBlob, isUploaded, isUploading, isFailed, isPending, isLocalOnly } = useBlobUploadStatus(attachmentId);

  // No local blob or already uploaded, no badge needed.
  if (!hasLocalBlob || isUploaded) return null;

  let icon: React.ReactNode;
  let tooltip: string;

  if (isUploading) {
    icon = <LoaderIcon className="animate-spin text-background" size={10} />;
    tooltip = t('c:uploading');
  } else if (isPending) {
    icon = <UploadCloudIcon className="text-background" size={10} />;
    tooltip = t('c:pending_sync');
  } else if (isFailed) {
    icon = <AlertCircleIcon className="text-background" size={10} />;
    tooltip = t('c:upload_failed');
  } else if (isLocalOnly) {
    icon = <CloudOffIcon className="text-background" size={10} />;
    tooltip = t('c:local_only');
  } else {
    return null;
  }

  return (
    <div
      className={`absolute -right-0.5 -bottom-0.5 rounded-full p-0.5 ${isFailed ? 'bg-destructive' : 'bg-muted-foreground'}`}
      data-tooltip="true"
      data-tooltip-content={tooltip}
    >
      {icon}
    </div>
  );
};

interface DownloadCellProps {
  row: Attachment;
  tabIndex: number;
}

export const DownloadCell = ({ row, tabIndex }: DownloadCellProps) => {
  const { t } = useTranslation();
  const { download, error, isInProgress } = useDownloader();

  useEffect(() => {
    if (!error) return;
    toaster(t('error:download_failed'), 'error');
  }, [error, t]);

  // Check if blob is uploaded to cloud
  const { isUploaded, hasLocalBlob } = useBlobUploadStatus(row.id);
  const canDownload = !hasLocalBlob || isUploaded;

  if (!canDownload) return <div className="w-full text-center text-muted">-</div>;

  return (
    <Button
      variant="cell"
      size="cell"
      tabIndex={tabIndex}
      disabled={isInProgress}
      className="justify-center"
      aria-label="Download"
      data-tooltip="true"
      data-tooltip-content={t('c:download')}
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
  const ellipsisOptions: EllipsisOption<Attachment>[] = [
    {
      label: i18n.t('c:delete'),
      icon: TrashIcon,
      onSelect: (row) => {
        const { update, remove } = useDropdowner.getState();

        update({
          content: (
            <PopConfirm title={i18n.t('c:delete_confirm.text', { name: row.name })}>
              <DeleteAttachments attachments={[row]} callback={remove} onCancel={remove} />
            </PopConfirm>
          ),
        });
      },
    },
  ];

  return <TableEllipsis row={row} tabIndex={tabIndex} options={ellipsisOptions} />;
};
