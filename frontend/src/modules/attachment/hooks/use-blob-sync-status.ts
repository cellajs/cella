/**
 * Hook to get blob sync status from Dexie storage.
 *
 * Returns the sync status for attachments stored in IndexedDB:
 * - 'pending': Waiting to upload
 * - 'syncing': Currently uploading
 * - 'synced': Successfully uploaded or downloaded from cloud
 * - 'failed': Upload failed after retries
 * - 'local-only': No cloud configured, permanent local storage
 * - null: Not in local storage (cloud-only attachment)
 */
import { useEffect, useState } from 'react';
import { type AttachmentBlob, attachmentsDb, type SyncStatus } from '~/modules/attachment/dexie/attachments-db';

export interface BlobSyncInfo {
  /** Sync status or null if not in local storage */
  syncStatus: SyncStatus | null;
  /** Whether blob exists locally */
  hasLocalBlob: boolean;
  /** Whether attachment is synced to cloud */
  isSynced: boolean;
  /** Whether attachment is currently syncing */
  isSyncing: boolean;
  /** Whether attachment sync failed */
  isFailed: boolean;
  /** Whether attachment is pending sync */
  isPending: boolean;
  /** Whether attachment is local-only (no cloud) */
  isLocalOnly: boolean;
  /** Last error message if failed */
  lastError: string | null;
}

const defaultSyncInfo: BlobSyncInfo = {
  syncStatus: null,
  hasLocalBlob: false,
  isSynced: true, // No local blob = assume synced (cloud-only)
  isSyncing: false,
  isFailed: false,
  isPending: false,
  isLocalOnly: false,
  lastError: null,
};

/** Convert blob record to sync info */
function blobToSyncInfo(blob: AttachmentBlob | undefined): BlobSyncInfo {
  if (!blob) return defaultSyncInfo;

  return {
    syncStatus: blob.syncStatus,
    hasLocalBlob: true,
    isSynced: blob.syncStatus === 'synced',
    isSyncing: blob.syncStatus === 'syncing',
    isFailed: blob.syncStatus === 'failed',
    isPending: blob.syncStatus === 'pending',
    isLocalOnly: blob.syncStatus === 'local-only',
    lastError: blob.lastError,
  };
}

/**
 * Get sync status for a single attachment.
 * Polls for changes while component is mounted.
 */
export function useBlobSyncStatus(attachmentId: string | null | undefined): BlobSyncInfo {
  const [syncInfo, setSyncInfo] = useState<BlobSyncInfo>(defaultSyncInfo);

  useEffect(() => {
    if (!attachmentId) {
      setSyncInfo(defaultSyncInfo);
      return;
    }

    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const blob = await attachmentsDb.blobs.get(attachmentId);
        if (!cancelled) {
          setSyncInfo(blobToSyncInfo(blob));
        }
      } catch (error) {
        console.error('Failed to get blob sync status:', error);
        if (!cancelled) {
          setSyncInfo(defaultSyncInfo);
        }
      }
    };

    // Initial fetch
    fetchStatus();

    // Poll for changes (sync status can change when upload completes)
    const intervalId = setInterval(fetchStatus, 2000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [attachmentId]);

  return syncInfo;
}

/**
 * Get sync status for multiple attachments.
 * Returns a Map of attachment ID to sync info.
 */
export function useBlobSyncStatusBatch(attachmentIds: string[] | null | undefined): Map<string, BlobSyncInfo> {
  const [syncInfoMap, setSyncInfoMap] = useState<Map<string, BlobSyncInfo>>(new Map());

  useEffect(() => {
    if (!attachmentIds?.length) {
      setSyncInfoMap(new Map());
      return;
    }

    let cancelled = false;

    const fetchStatuses = async () => {
      try {
        const blobs = await attachmentsDb.blobs.where('id').anyOf(attachmentIds).toArray();

        if (!cancelled) {
          const result = new Map<string, BlobSyncInfo>();

          // Initialize all IDs with default (cloud-only)
          for (const id of attachmentIds) {
            result.set(id, defaultSyncInfo);
          }

          // Override with actual blob data
          for (const blob of blobs) {
            result.set(blob.id, blobToSyncInfo(blob));
          }

          setSyncInfoMap(result);
        }
      } catch (error) {
        console.error('Failed to get blob sync statuses:', error);
      }
    };

    // Initial fetch
    fetchStatuses();

    // Poll for changes
    const intervalId = setInterval(fetchStatuses, 2000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [attachmentIds?.join(',')]);

  return syncInfoMap;
}
