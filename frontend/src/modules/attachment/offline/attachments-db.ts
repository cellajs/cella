import type { Dexie } from 'dexie';
import type { UploadTemplateId } from 'shared';
import { getLocalUserDb } from '~/query/local-user-db';

type BlobSource = 'upload' | 'download';
export type UploadStatus = 'pending' | 'uploading' | 'uploaded' | 'failed' | 'local-only';
export type DownloadStatus = 'pending' | 'downloading' | 'downloaded' | 'failed' | 'skipped';

/** Transloadit blob stages: raw upload, processed original, conversion, mid-size preview, tiny grid-cell thumbnail. */
export type BlobVariant = 'raw' | 'original' | 'converted' | 'preview' | 'thumbnail';

/** Composite blob key, formatted `${attachmentId}:${variant}`. */
export function makeBlobKey(attachmentId: string, variant: BlobVariant): string {
  return `${attachmentId}:${variant}`;
}

/** Upload context stored with a blob, used when the upload service re-uploads it. */
export interface UploadContext {
  templateId: UploadTemplateId;
  publicBucket: boolean;
}

/** Blob storage: one table for locally created uploads and blobs fetched from the cloud for offline viewing. */
export interface AttachmentBlob {
  /** Composite key: `${attachmentId}:${variant}`. Use makeBlobKey() to create. */
  id: string;

  attachmentId: string;
  variant: BlobVariant;
  organizationId: string;
  blob: Blob;

  /** Original filename (used by the upload service during re-upload) */
  filename?: string;

  uploadContext?: UploadContext;

  /** File size in bytes (denormalized for filtering) */
  size: number;

  /** MIME type (denormalized for filtering) */
  contentType: string;

  /** How this blob was created: 'upload' (local, may need uploading) or 'download' (from cloud). */
  source: BlobSource;

  /** Upload status: 'uploaded' means "exists in cloud" (downloads included), 'local-only' means no cloud is configured, the rest apply to source='upload'. */
  uploadStatus: UploadStatus;

  /** Upload retry count (source='upload' only) */
  uploadAttempts?: number;

  /** Next retry timestamp for exponential backoff (source='upload' only) */
  nextRetryAt?: Date | null;

  /** Last error message (source='upload' only) */
  lastError?: string | null;

  storedAt: Date;
}

/** Queue of attachments to cache locally for offline viewing, kept separate from blob storage. */
export interface DownloadQueueEntry {
  /** Matches Attachment.id */
  id: string;

  organizationId: string;

  /** Download priority; lower runs first. */
  priority: number;

  /** Download status; 'skipped' means filtered out (too large / wrong type), see skipReason. */
  status: DownloadStatus;

  /** Why skipped (if status='skipped') */
  skipReason: string | null;

  queuedAt: Date;
  attempts: number;
}

/** Blob and download-queue tables of the active per-user localUserDb; accessors throw while signed out, so guard with `getLocalUserDb()`. */
export const attachmentsDb = {
  get blobs(): Dexie.Table<AttachmentBlob, string> {
    const db = getLocalUserDb();
    if (!db) throw new Error('[attachmentsDb] No localUserDb bound (signed out)');
    return db.blobs;
  },
  get downloadQueue(): Dexie.Table<DownloadQueueEntry, string> {
    const db = getLocalUserDb();
    if (!db) throw new Error('[attachmentsDb] No localUserDb bound (signed out)');
    return db.downloadQueue;
  },
};
