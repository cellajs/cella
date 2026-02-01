/**
 * Hook to get blob upload status from Dexie storage.
 * Returns upload status for attachments stored in IndexedDB.
 */
import { useEffect, useState } from 'react';
import {
  type AttachmentBlob,
  attachmentsDb,
  type BlobVariant,
  type UploadStatus,
} from '~/modules/attachment/dexie/attachments-db';

export interface BlobUploadInfo {
  uploadStatus: UploadStatus | null;
  hasLocalBlob: boolean;
  storedVariants: BlobVariant[];
  isUploaded: boolean;
  isUploading: boolean;
  isFailed: boolean;
  isPending: boolean;
  isLocalOnly: boolean;
  lastError: string | null;
}

const defaultUploadInfo: BlobUploadInfo = {
  uploadStatus: null,
  hasLocalBlob: false,
  storedVariants: [],
  isUploaded: true,
  isUploading: false,
  isFailed: false,
  isPending: false,
  isLocalOnly: false,
  lastError: null,
};

function blobsToUploadInfo(blobs: AttachmentBlob[]): BlobUploadInfo {
  if (!blobs.length) return defaultUploadInfo;

  const storedVariants = blobs.map((b) => b.variant);
  const rawBlob = blobs.find((b) => b.variant === 'raw');
  const primaryBlob = rawBlob || blobs[0];

  return {
    uploadStatus: primaryBlob.uploadStatus,
    hasLocalBlob: true,
    storedVariants,
    isUploaded: primaryBlob.uploadStatus === 'uploaded',
    isUploading: primaryBlob.uploadStatus === 'uploading',
    isFailed: primaryBlob.uploadStatus === 'failed',
    isPending: primaryBlob.uploadStatus === 'pending',
    isLocalOnly: primaryBlob.uploadStatus === 'local-only',
    lastError: primaryBlob.lastError,
  };
}

/**
 * Get upload status for an attachment. Polls for changes while mounted.
 */
export function useBlobUploadStatus(attachmentId: string | null | undefined): BlobUploadInfo {
  const [uploadInfo, setUploadInfo] = useState<BlobUploadInfo>(defaultUploadInfo);

  useEffect(() => {
    if (!attachmentId) {
      setUploadInfo(defaultUploadInfo);
      return;
    }

    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const blobs = await attachmentsDb.blobs.where('attachmentId').equals(attachmentId).toArray();
        if (!cancelled) setUploadInfo(blobsToUploadInfo(blobs));
      } catch (error) {
        console.error('Failed to get blob upload status:', error);
        if (!cancelled) setUploadInfo(defaultUploadInfo);
      }
    };

    fetchStatus();
    const intervalId = setInterval(fetchStatus, 2000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [attachmentId]);

  return uploadInfo;
}
