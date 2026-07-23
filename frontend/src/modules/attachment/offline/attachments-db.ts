import type { EntityTable } from 'dexie';
import type { UploadTemplateId } from 'shared';
import { getAppDb } from '~/query/app-db';

type BlobSource = 'upload' | 'download';
export type UploadStatus = 'pending' | 'uploading' | 'uploaded' | 'failed' | 'local-only';
export type DownloadStatus = 'pending' | 'downloading' | 'downloaded' | 'failed' | 'skipped';

/** Transloadit blob stages: raw upload, processed original, conversion, or thumbnail. */
export type BlobVariant = 'raw' | 'original' | 'converted' | 'thumbnail';

/**
 * Create composite key for variant-aware blob storage.
 * Format: `${attachmentId}:${variant}`
 */
export function makeBlobKey(attachmentId: string, variant: BlobVariant): string {
  return `${attachmentId}:${variant}`;
}

/** Upload context stored with a blob, used when the upload service re-uploads it. */
export interface UploadContext {
  templateId: UploadTemplateId;
  publicBucket: boolean;
}

/**
 * Blob storage. One table serves both 'upload' (created locally, pending cloud upload) and
 * 'download' (fetched from cloud for offline viewing) sources.
 */
export interface AttachmentBlob {
  /** Composite key: `${attachmentId}:${variant}`. Use makeBlobKey() to create. */
  id: string;

  /** The attachment ID this blob belongs to */
  attachmentId: string;

  /** Which variant of the attachment this blob represents */
  variant: BlobVariant;

  /** Organization scope */
  organizationId: string;

  /** The actual file blob */
  blob: Blob;

  /** Original filename (used by the upload service during re-upload) */
  filename?: string;

  /** Upload context for the upload service (templateId, publicBucket flag) */
  uploadContext?: UploadContext;

  /** File size in bytes (denormalized for filtering) */
  size: number;

  /** MIME type (denormalized for filtering) */
  contentType: string;

  /** How this blob was created: 'upload' (local, may need uploading) or 'download' (from cloud). */
  source: BlobSource;

  /**
   * Upload status. Note 'uploaded' also covers blobs downloaded from cloud (it effectively means
   * "exists in cloud"), and 'local-only' means no cloud is configured (permanent local storage);
   * other states apply only to source='upload'.
   */
  uploadStatus: UploadStatus;

  /** Upload retry count (source='upload' only) */
  uploadAttempts?: number;

  /** Next retry timestamp for exponential backoff (source='upload' only) */
  nextRetryAt?: Date | null;

  /** Last error message (source='upload' only) */
  lastError?: string | null;

  /** When blob was stored */
  storedAt: Date;
}

/**
 * Download queue that tracks which attachments to cache locally for offline viewing.
 * Separate from blob storage for clean queue management.
 */
export interface DownloadQueueEntry {
  /** Matches Attachment.id */
  id: string;

  /** Organization scope */
  organizationId: string;

  /** Download priority (lower = higher priority) */
  priority: number;

  /** Download status; 'skipped' means filtered out (too large / wrong type), see skipReason. */
  status: DownloadStatus;

  /** Why skipped (if status='skipped') */
  skipReason: string | null;

  /** When added to queue */
  queuedAt: Date;

  /** Download attempts */
  attempts: number;
}

/**
 * Resolves attachment blob and download-queue tables from the active per-user appdb.
 * Accessors throw while signed out; guard with `getAppDb()` where no DB is reachable.
 */
export const attachmentsDb = {
  get blobs(): EntityTable<AttachmentBlob, 'id'> {
    const db = getAppDb();
    if (!db) throw new Error('[attachmentsDb] No appdb bound (signed out)');
    return db.blobs as unknown as EntityTable<AttachmentBlob, 'id'>;
  },
  get downloadQueue(): EntityTable<DownloadQueueEntry, 'id'> {
    const db = getAppDb();
    if (!db) throw new Error('[attachmentsDb] No appdb bound (signed out)');
    return db.downloadQueue as unknown as EntityTable<DownloadQueueEntry, 'id'>;
  },
};
