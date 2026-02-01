import { AlertCircleIcon, CloudIcon, CloudOffIcon, LoaderIcon, UploadCloudIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Attachment } from '~/api.gen';
import { useBlobSyncStatus } from '~/modules/attachment/hooks/use-blob-sync-status';

interface SyncStatusCellProps {
  row: Attachment;
}

/**
 * Displays sync status for an attachment with appropriate icon and tooltip.
 * Uses Dexie blob storage to determine actual sync state.
 */
export const SyncStatusCell = ({ row }: SyncStatusCellProps) => {
  const { t } = useTranslation();
  const { syncStatus, hasLocalBlob, isSynced, isSyncing, isFailed, isPending, isLocalOnly } = useBlobSyncStatus(row.id);

  // No local blob = cloud-only (synced)
  if (!hasLocalBlob || isSynced) {
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

  // Currently syncing
  if (isSyncing) {
    return (
      <div
        className="flex justify-center items-center h-full w-full"
        data-tooltip="true"
        data-tooltip-content={t('common:syncing')}
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

  // Failed sync
  if (isFailed) {
    return (
      <div
        className="flex justify-center items-center h-full w-full"
        data-tooltip="true"
        data-tooltip-content={t('common:sync_failed')}
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
      data-tooltip-content={syncStatus || t('common:unknown')}
    >
      <CloudIcon className="text-muted-foreground" size={16} />
    </div>
  );
};
