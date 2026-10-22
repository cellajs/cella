import { useNavigate } from '@tanstack/react-router';
import { CircleAlertIcon, CloudOffIcon, CloudUploadIcon, DownloadIcon, LoaderIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Attachment } from 'sdk';
import { useDownloader } from '~/hooks/use-downloader';
import { openAttachmentDialogSearch } from '~/modules/attachment/dialog/params';
import { getCloudUrl } from '~/modules/attachment/file-url';
import { isPendingUpload, pendingUploadMessage } from '~/modules/attachment/helpers/pending-uploads';
import { useAttachmentUrl } from '~/modules/attachment/hooks/use-attachment-url';
import { useBlobUploadStatus } from '~/modules/attachment/hooks/use-blob-upload-status';
import { attachmentStorage } from '~/modules/attachment/offline/storage-service';
import { MediaThumbnail } from '~/modules/common/media-thumbnail';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

interface AttachmentCellProps {
  row: Attachment;
  tabIndex: number;
}

export function ThumbnailCell({ row, tabIndex }: AttachmentCellProps) {
  const { id, filename, contentType, groupId } = row;
  const navigate = useNavigate();

  const wrapClass = tw('relative flex size-full items-center justify-center gap-2');

  // Table cells prefer the tiny thumbnail; non-image types have none and fall back to the mid-size preview.
  const { url } = useAttachmentUrl(row, { preferredVariant: 'thumbnail' });

  const handleClick = () => {
    navigate({ to: '.', replace: false, resetScroll: false, search: openAttachmentDialogSearch(id, groupId) });
  };

  const preview = <MediaThumbnail name={filename} url={url} contentType={contentType} />;
  const badge = <UploadStatusBadge row={row} />;

  return (
    <Button variant="cell" size="cell" tabIndex={tabIndex} className={wrapClass} aria-label={filename} onClick={handleClick}>
      {preview}
      {badge}
    </Button>
  );
}

/** What this device can tell about the file: its own upload's progress, or, without the file, that its uploader still holds it. */
function UploadStatusBadge({ row }: { row: Attachment }) {
  const { t } = useTranslation();
  const { hasLocalBlob, isUploaded, isUploading, isFailed, isPending, isLocalOnly } = useBlobUploadStatus(row.id);

  if (hasLocalBlob && isUploaded) return null;

  let icon: React.ReactNode;
  let tooltip: string;

  if (!hasLocalBlob) {
    if (!isPendingUpload(row)) return null;
    const { key, params } = pendingUploadMessage({ uploader: row.createdBy });
    icon = <CloudOffIcon className="size-2.5 text-background" />;
    tooltip = t(key, params);
  } else if (isUploading) {
    icon = <LoaderIcon className="size-2.5 animate-spin text-background" />;
    tooltip = t('c:uploading');
  } else if (isPending) {
    icon = <CloudUploadIcon className="size-2.5 text-background" />;
    tooltip = t('c:pending_upload');
  } else if (isFailed) {
    icon = <CircleAlertIcon className="size-2.5 text-background" />;
    tooltip = t('c:upload_failed');
  } else if (isLocalOnly) {
    icon = <CloudOffIcon className="size-2.5 text-background" />;
    tooltip = t('c:local_only');
  } else {
    return null;
  }

  return (
    <div
      className={cn('absolute -right-0.5 -bottom-0.5 rounded-full p-0.5', isFailed ? 'bg-destructive' : 'bg-muted-foreground')}
      data-tooltip="true"
      data-tooltip-content={tooltip}
    >
      {icon}
    </div>
  );
}

export function DownloadCell({ row, tabIndex }: AttachmentCellProps) {
  const { t } = useTranslation();
  const { download, isInProgress } = useDownloader();
  const { hasLocalBlob } = useBlobUploadStatus(row.id);
  const pending = !hasLocalBlob && isPendingUpload(row) ? pendingUploadMessage({ uploader: row.createdBy }) : null;
  const tooltip = pending ? t(pending.key, pending.params) : t('c:download');

  // Local-first: a stored blob saves without the network, and the cloud URL is the fallback.
  const handleDownload = async () => {
    if (pending) return;
    try {
      const local = await attachmentStorage.createBlobUrlWithVariant(row.id, 'original', true);
      if (local) {
        try {
          await download(local.url, row.filename);
        } finally {
          URL.revokeObjectURL(local.url);
        }
        return;
      }
      const url = await getCloudUrl(row, 'original');
      if (!url) throw new Error('No cloud URL for attachment');
      await download(url, row.filename);
    } catch {
      toaster.error(t('error:download_failed'));
    }
  };

  return (
    <Button
      variant="cell"
      size="cell"
      tabIndex={tabIndex}
      disabled={isInProgress}
      // Not `disabled`: the tooltip says why there is nothing to download, and a disabled button would not show it.
      aria-disabled={!!pending}
      className={cn('justify-center', pending && 'opacity-50')}
      aria-label={tooltip}
      data-tooltip="true"
      data-tooltip-content={tooltip}
      onClick={handleDownload}
    >
      {isInProgress ? <Spinner size="sm" className="text-foreground/80" noDelay /> : pending ? <CloudOffIcon /> : <DownloadIcon />}
    </Button>
  );
}
