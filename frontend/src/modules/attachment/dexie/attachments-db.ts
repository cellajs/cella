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
import { appConfig } from 'config';
import { Dexie, type EntityTable } from 'dexie';

export type BlobSource = 'upload' | 'download';
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'local-only';
export type QueueStatus = 'pending' | 'downloading' | 'completed' | 'failed' | 'skipped';

/**
 * Blob storage for attachments.
 *
 * Single table serves two purposes:
 * - 'upload': Files created locally, pending cloud sync
 * - 'download': Files fetched from cloud for offline viewing
 */
export interface AttachmentBlob {
  /** Matches Attachment.id in react-query cache */
  id: string;

  /** Organization scope */
  organizationId: string;

  /** The actual file blob */
  blob: Blob;

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
   * Sync status:
   * - 'pending': Waiting to upload (source='upload' only)
   * - 'syncing': Currently uploading (source='upload' only)
   * - 'synced': Uploaded successfully or downloaded from cloud
   * - 'failed': Upload failed after retries (source='upload' only)
   * - 'local-only': No cloud configured, permanent local storage
   */
  syncStatus: SyncStatus;

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
   * Queue status:
   * - 'pending': Waiting to download
   * - 'downloading': Currently fetching
   * - 'completed': Successfully stored in blobs table
   * - 'failed': Download failed
   * - 'skipped': Skipped due to filter (too large, wrong type)
   */
  status: QueueStatus;

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
        '&id, organizationId, source, syncStatus, contentType, [organizationId+source], [organizationId+syncStatus]',
      downloadQueue: '&id, organizationId, status, priority, [organizationId+status]',
    });
  }
}

export const attachmentsDb = new AttachmentsDatabase();
