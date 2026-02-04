/**
 * Dexie Database for Attachment Blob Storage
 *
 * Unified storage for local-first attachments:
 * - blobs: File blobs for uploads (pending/synced) and downloads (cached)
 * - downloadQueue: Queue for background fetching of cloud attachments
 *
 * React-query cache is the source of truth for attachment metadata.
 * This database only stores the actual blob data and sync state.
 */

import { Dexie, type EntityTable } from 'dexie';
import { appConfig, type UploadTemplateId } from 'shared';

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
  syncAttempts: number;

  /** Next retry timestamp for exponential backoff */
  nextRetryAt: Date | null;

  /** Last error message */
  lastError: string | null;

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

export class AttachmentsDatabase extends Dexie {
  blobs!: EntityTable<AttachmentBlob, 'id'>;
  downloadQueue!: EntityTable<DownloadQueueEntry, 'id'>;

  constructor() {
    super(`${appConfig.slug}-attachments`);

    this.version(1).stores({
      blobs:
        '&id, attachmentId, variant, organizationId, source, uploadStatus, contentType, [organizationId+source], [organizationId+uploadStatus], [attachmentId+variant]',
      downloadQueue: '&id, organizationId, status, priority, [organizationId+status]',
    });
  }
}

export const attachmentsDb = new AttachmentsDatabase();
