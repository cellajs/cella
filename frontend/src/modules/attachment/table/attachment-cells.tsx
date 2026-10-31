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
import type { IconComponent } from '~/modules/common/icons/types';
import { MediaThumbnail } from '~/modules/common/media-thumbnail';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface AttachmentCellProps {
  row: Attachment;
  tabIndex: number;
}

export function ThumbnailCell({ row, tabIndex }: AttachmentCellProps) {
  const { id, filename, contentType, groupId } = row;
  const navigate = useNavigate();

  // Table cells prefer the tiny thumbnail; a file without one falls back to a local preview, else the original.
  const { url } = useAttachmentUrl(row, { preferredVariant: 'thumbnail' });

  const handleClick = () => {
    navigate({ to: '.', replace: false, resetScroll: false, search: openAttachmentDialogSearch(id, groupId) });
  };

  return (
    <Button variant="cell" size="cell" tabIndex={tabIndex} className="relative justify-center" aria-label={filename} onClick={handleClick}>
      <MediaThumbnail name={filename} url={url} contentType={contentType} />
      <UploadStatusBadge row={row} />
    </Button>
  );
}

/** What this device can tell about the file: its own upload's progress, or, without the file, that its uploader still holds it. */
function UploadStatusBadge({ row }: Pick<AttachmentCellProps, 'row'>) {
  const { t } = useTranslation();
  const { hasLocalBlob, isUploaded, isUploading, isFailed, isPending, isLocalOnly } = useBlobUploadStatus(row.id);

  if (hasLocalBlob && isUploaded) return null;

  let Icon: IconComponent;
  let tooltip: string;

  if (!hasLocalBlob) {
    if (!isPendingUpload(row)) return null;
    const { key, params } = pendingUploadMessage({ uploader: row.createdBy });
    Icon = CloudOffIcon;
    tooltip = t(key, params);
  } else if (isUploading) {
    Icon = LoaderIcon;
    tooltip = t('c:uploading');
  } else if (isPending) {
    Icon = CloudUploadIcon;
    tooltip = t('c:pending_upload');
  } else if (isFailed) {
    Icon = CircleAlertIcon;
    tooltip = t('c:upload_failed');
  } else if (isLocalOnly) {
    Icon = CloudOffIcon;
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
      <Icon className={cn('size-2.5 text-background', isUploading && 'animate-spin')} />
    </div>
  );
}

/** Saves the stored blob, else the cloud file; throws when neither exists. */
async function saveAttachment(row: Attachment, download: (url: string, filename: string) => Promise<unknown>) {
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
      await saveAttachment(row, download);
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
      className="justify-center aria-disabled:opacity-50 aria-disabled:hover:text-foreground-soft"
      aria-label={tooltip}
      data-tooltip="true"
      data-tooltip-content={tooltip}
      onClick={handleDownload}
    >
      {isInProgress ? <Spinner size="sm" className="text-foreground-soft" noDelay /> : pending ? <CloudOffIcon /> : <DownloadIcon />}
    </Button>
  );
}
