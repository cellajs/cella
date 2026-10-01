import { useNavigate } from '@tanstack/react-router';
import { CircleAlertIcon, CloudOffIcon, CloudUploadIcon, DownloadIcon, LoaderIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useDownloader from 'react-use-downloader';
import type { Attachment } from 'sdk';
import { openAttachmentDialogSearch } from '~/modules/attachment/dialog/params';
import { getCloudUrl } from '~/modules/attachment/file-url';
import { useAttachmentUrl } from '~/modules/attachment/hooks/use-attachment-url';
import { useBlobUploadStatus } from '~/modules/attachment/hooks/use-blob-upload-status';
import { attachmentStorage } from '~/modules/attachment/offline/storage-service';
import { MediaThumbnail } from '~/modules/common/media-thumbnail';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface ThumbnailCellProps {
  row: Attachment;
  tabIndex: number;
}

export function ThumbnailCell({ row, tabIndex }: ThumbnailCellProps) {
  const { id, filename, contentType, groupId } = row;
  const navigate = useNavigate();
  const cellRef = useRef<HTMLButtonElement | null>(null);

  const wrapClass = 'relative flex space-x-2 items-center justify-center w-full h-full';

  // Table cells prefer the tiny thumbnail; non-image types have none and fall back to the mid-size preview.
  const { url } = useAttachmentUrl(row, { preferredVariant: 'thumbnail' });

  const handleClick = () => {
    navigate({ to: '.', replace: false, resetScroll: false, search: openAttachmentDialogSearch(id, groupId) });
  };

  const preview = <MediaThumbnail name={filename} url={url} contentType={contentType} />;
  const badge = <SyncStatusBadge attachmentId={id} />;

  return (
    <Button ref={cellRef} variant="cell" size="cell" tabIndex={tabIndex} className={wrapClass} onClick={handleClick}>
      {preview}
      {badge}
    </Button>
  );
}

function SyncStatusBadge({ attachmentId }: { attachmentId: string }) {
  const { t } = useTranslation();
  const { hasLocalBlob, isUploaded, isUploading, isFailed, isPending, isLocalOnly } = useBlobUploadStatus(attachmentId);

  if (!hasLocalBlob || isUploaded) return null;

  let icon: React.ReactNode;
  let tooltip: string;

  if (isUploading) {
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

interface DownloadCellProps {
  row: Attachment;
  tabIndex: number;
}

export function DownloadCell({ row, tabIndex }: DownloadCellProps) {
  const { t } = useTranslation();
  const { download, error, isInProgress } = useDownloader();

  useEffect(() => {
    if (!error) return;
    toaster.error(t('error:download_failed'));
  }, [error, t]);

  // Local-first: a stored blob saves without the network, and the cloud URL is the fallback.
  const handleDownload = async () => {
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
      className="justify-center"
      aria-label="Download"
      data-tooltip="true"
      data-tooltip-content={t('c:download')}
      onClick={handleDownload}
    >
      {isInProgress ? <Spinner className="size-4 text-foreground/80" noDelay /> : <DownloadIcon />}
    </Button>
  );
}
