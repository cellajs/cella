import { AlertCircleIcon, CloudIcon, CloudOffIcon, LoaderIcon, UploadCloudIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Attachment } from '~/api.gen';
import { useBlobUploadStatus } from '~/modules/attachment/hooks/use-blob-sync-status';

interface SyncStatusCellProps {
  row: Attachment;
}

/**
 * Displays upload status for an attachment with appropriate icon and tooltip.
 * Uses Dexie blob storage to determine actual upload state.
 */
export const SyncStatusCell = ({ row }: SyncStatusCellProps) => {
  const { t } = useTranslation();
  const { uploadStatus, hasLocalBlob, isUploaded, isUploading, isFailed, isPending, isLocalOnly } = useBlobUploadStatus(
    row.id,
  );

  // No local blob = cloud-only (uploaded)
  if (!hasLocalBlob || isUploaded) {
    return (
      <div
        className="flex justify-center items-center h-full w-full"
        data-tooltip="true"
        data-tooltip-content={t('common:synced')}
      >
        <CloudIcon className="text-success" size={16} />
      </div>
    );
  }

  // Currently uploading
  if (isUploading) {
    return (
      <div
        className="flex justify-center items-center h-full w-full"
        data-tooltip="true"
        data-tooltip-content={t('common:uploading')}
      >
        <LoaderIcon className="text-muted-foreground animate-spin" size={16} />
      </div>
    );
  }

  // Pending upload
  if (isPending) {
    return (
      <div
        className="flex justify-center items-center h-full w-full"
        data-tooltip="true"
        data-tooltip-content={t('common:pending_sync')}
      >
        <UploadCloudIcon className="text-muted-foreground" size={16} />
      </div>
    );
  }

  // Failed upload
  if (isFailed) {
    return (
      <div
        className="flex justify-center items-center h-full w-full"
        data-tooltip="true"
        data-tooltip-content={t('common:upload_failed')}
      >
        <AlertCircleIcon className="text-destructive" size={16} />
      </div>
    );
  }

  // Local-only (no cloud configured)
  if (isLocalOnly) {
    return (
      <div
        className="flex justify-center items-center h-full w-full"
        data-tooltip="true"
        data-tooltip-content={t('common:local_only')}
      >
        <CloudOffIcon className="text-muted-foreground" size={16} />
      </div>
    );
  }

  // Fallback (shouldn't happen)
  return (
    <div
      className="flex justify-center items-center h-full w-full"
      data-tooltip="true"
      data-tooltip-content={uploadStatus || t('common:unknown')}
    >
      <CloudIcon className="text-muted-foreground" size={16} />
    </div>
  );
};
