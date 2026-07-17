import { useLiveQuery } from 'dexie-react-hooks';
import { type AttachmentBlob, attachmentsDb } from '~/modules/attachment/dexie/attachments-db';
import { getAppDb } from '~/query/app-db';

interface BlobUploadInfo {
  /** False when no local blob exists for this attachment — i.e. it lives only in the cloud. */
  hasLocalBlob: boolean;
  isUploaded: boolean;
  isUploading: boolean;
  isFailed: boolean;
  isPending: boolean;
  isLocalOnly: boolean;
  lastError: string | null;
}

/** No local blob means the attachment is cloud-only, which is the "done" state for the UI. */
const defaultUploadInfo: BlobUploadInfo = {
  hasLocalBlob: false,
  isUploaded: true,
  isUploading: false,
  isFailed: false,
  isPending: false,
  isLocalOnly: false,
  lastError: null,
};

function blobsToUploadInfo(blobs: AttachmentBlob[]): BlobUploadInfo {
  if (!blobs.length) return defaultUploadInfo;

  // The raw blob carries the upload state; downloaded variants are by definition already in cloud.
  const rawBlob = blobs.find((b) => b.variant === 'raw');
  const primaryBlob = rawBlob || blobs[0];

  return {
    hasLocalBlob: true,
    isUploaded: primaryBlob.uploadStatus === 'uploaded',
    isUploading: primaryBlob.uploadStatus === 'uploading',
    isFailed: primaryBlob.uploadStatus === 'failed',
    isPending: primaryBlob.uploadStatus === 'pending',
    isLocalOnly: primaryBlob.uploadStatus === 'local-only',
    lastError: primaryBlob.lastError ?? null,
  };
}

/**
 * Get upload status for an attachment, reactively.
 * Returns the default ("uploaded") info while no attachmentId is provided or no blob exists.
 */
export function useBlobUploadStatus(attachmentId: string | null | undefined): BlobUploadInfo {
  const blobs = useLiveQuery(
    () => (attachmentId && getAppDb() ? attachmentsDb.blobs.where('attachmentId').equals(attachmentId).toArray() : []),
    [attachmentId],
    [] as AttachmentBlob[],
  );

  return blobsToUploadInfo(blobs);
}
