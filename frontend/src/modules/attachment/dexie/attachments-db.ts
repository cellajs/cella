import type { EntityTable } from 'dexie';
import type { UploadTemplateId } from 'shared';
import { getAppDb } from '~/query/app-db';

export type BlobSource = 'upload' | 'download';
export type UploadStatus = 'pending' | 'uploading' | 'uploaded' | 'failed' | 'local-only';
export type DownloadStatus = 'pending' | 'downloading' | 'downloaded' | 'failed' | 'skipped';

/**
 * Blob variant types:
 * - 'raw': Original file from user upload (before Transloadit processing)
 * - 'original': Processed original from Transloadit (:original step)
 * - 'converted': Converted format from Transloadit (e.g., PDF to images)
 * - 'thumbnail': Thumbnail from Transloadit (thumb_* steps)
 */
export type BlobVariant = 'raw' | 'original' | 'converted' | 'thumbnail';

/**
 * Create composite key for variant-aware blob storage.
 * Format: `${attachmentId}:${variant}`
 */
export function makeBlobKey(attachmentId: string, variant: BlobVariant): string {
  return `${attachmentId}:${variant}`;
}

/**
 * Parse composite key back to attachmentId and variant.
 */
export function parseBlobKey(compositeKey: string): { attachmentId: string; variant: BlobVariant } | null {
  const lastColon = compositeKey.lastIndexOf(':');
  if (lastColon === -1) return null;

  const attachmentId = compositeKey.slice(0, lastColon);
  const variant = compositeKey.slice(lastColon + 1) as BlobVariant;

  if (!['raw', 'original', 'converted', 'thumbnail'].includes(variant)) return null;

  return { attachmentId, variant };
}

/** Upload context stored with blob for sync worker to use when re-uploading */
export interface UploadContext {
  templateId: UploadTemplateId;
  public: boolean;
}

/**
 * Blob storage for attachments.
 *
 * Single table serves two purposes:
 * - 'upload': Files created locally, pending cloud sync
 * - 'download': Files fetched from cloud for offline viewing
 *
 * Uses composite key format: `${attachmentId}:${variant}`
 */
export interface AttachmentBlob {
  /**
   * Composite key: `${attachmentId}:${variant}`
   * Use makeBlobKey() to create, parseBlobKey() to parse.
   */
  id: string;

  /** The attachment ID this blob belongs to */
  attachmentId: string;

  /** Which variant of the attachment this blob represents */
  variant: BlobVariant;

  /** Organization scope */
  organizationId: string;

  /** The actual file blob */
  blob: Blob;

  /** Original filename (for sync worker to use during re-upload) */
  filename?: string;

  /** Upload context for sync worker (templateId, public flag) */
  uploadContext?: UploadContext;

  /** File size in bytes (denormalized for filtering) */
  size: number;

  /** MIME type (denormalized for filtering) */
  contentType: string;

  /**
   * How this blob was created:
   * - 'upload': User uploaded locally (may need cloud sync)
   * - 'download': Fetched from cloud for offline access
   */
  source: BlobSource;

  /**
   * Upload status:
   * - 'pending': Waiting to upload (source='upload' only)
   * - 'uploading': Currently uploading (source='upload' only)
   * - 'uploaded': Uploaded successfully or downloaded from cloud
   * - 'failed': Upload failed after retries (source='upload' only)
   * - 'local-only': No cloud configured, permanent local storage
   */
  uploadStatus: UploadStatus;

  /** Upload retry count (source='upload' only) */
  syncAttempts?: number;

  /** Next retry timestamp for exponential backoff (source='upload' only) */
  nextRetryAt?: Date | null;

  /** Last error message (source='upload' only) */
  lastError?: string | null;

  /** When blob was stored */
  storedAt: Date;
}

/**
 * Download queue - tracks which attachments to fetch for offline.
 * Separate from blob storage for clean queue management.
 */
export interface DownloadQueueEntry {
  /** Matches Attachment.id */
  id: string;

  /** Organization scope */
  organizationId: string;

  /** Download priority (lower = higher priority) */
  priority: number;

  /**
   * Download status:
   * - 'pending': Waiting to download
   * - 'downloading': Currently fetching
   * - 'downloaded': Successfully stored in blobs table
   * - 'failed': Download failed
   * - 'skipped': Skipped due to filter (too large, wrong type)
   */
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
