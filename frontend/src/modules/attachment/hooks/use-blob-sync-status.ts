import { useLiveQuery } from 'dexie-react-hooks';
import {
  type AttachmentBlob,
  attachmentsDb,
  type BlobVariant,
  type UploadStatus,
} from '~/modules/attachment/dexie/attachments-db';
import { getAppDb } from '~/query/app-db';

interface BlobUploadInfo {
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
