/**
 * Attachment Storage Service
 *
 * Unified service for local-first attachment handling:
 * - Store uploaded blobs locally (pending cloud sync or local-only)
 * - Cache downloaded blobs for offline viewing
 * - Manage sync status and retry logic
 * - Provide blob URLs for rendering
 *
 * React-query cache is the source of truth for attachment metadata.
 * This service manages the actual blob data.
 */
import * as Sentry from '@sentry/react';
import { appConfig } from 'config';
import type { Attachment } from '~/api.gen';
import {
  type AttachmentBlob,
  attachmentsDb,
  type BlobSource,
  type DownloadQueueEntry,
  type QueueStatus,
  type SyncStatus,
  type UploadContext,
} from '~/modules/attachment/dexie/attachments-db';
import type { CustomUppyFile } from '~/modules/common/uploader/types';

/**
 * Attachment storage service with local-first capabilities.
 */
class AttachmentStorageService {
  // ─────────────────────────────────────────────────────────────────────────────
  // BLOB STORAGE (Uploads + Downloads)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Store a blob from Uppy file upload.
   */
  async storeUploadBlob(
    file: CustomUppyFile,
    organizationId: string,
    syncStatus: SyncStatus = 'pending',
    uploadContext?: UploadContext,
  ): Promise<AttachmentBlob> {
    // Validate file has blob data
    if (!file.data || !(file.data instanceof Blob)) {
      throw new Error('File data must be a Blob');
    }

    const blobData = file.data as Blob;
    const size = file.size ?? blobData.size ?? 0;

    const blob: AttachmentBlob = {
      id: file.id,
      organizationId,
      blob: blobData,
      filename: file.name || undefined,
      uploadContext,
      size,
      contentType: file.type || 'application/octet-stream',
      source: 'upload',
      syncStatus,
      syncAttempts: 0,
      nextRetryAt: null,
      lastError: null,
      storedAt: new Date(),
    };

    try {
      await attachmentsDb.blobs.add(blob);
      return blob;
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to store upload blob:', error);
      throw error;
    }
  }

  /**
   * Store a blob from download (for offline viewing).
   */
  async storeDownloadBlob(
    id: string,
    organizationId: string,
    blob: Blob,
    contentType: string,
  ): Promise<AttachmentBlob> {
    const record: AttachmentBlob = {
      id,
      organizationId,
      blob,
      size: blob.size,
      contentType,
      source: 'download',
      syncStatus: 'synced', // Downloaded = already synced
      syncAttempts: 0,
      nextRetryAt: null,
      lastError: null,
      storedAt: new Date(),
    };

    try {
      await attachmentsDb.blobs.put(record);
      return record;
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to store download blob:', error);
      throw error;
    }
  }

  /**
   * Get a blob by ID.
   */
  async getBlob(id: string): Promise<AttachmentBlob | undefined> {
    try {
      return await attachmentsDb.blobs.get(id);
    } catch (error) {
      Sentry.captureException(error);
      console.error(`Failed to get blob (${id}):`, error);
      return undefined;
    }
  }

  /**
   * Get blob data for rendering.
   */
  async getBlobData(id: string): Promise<Blob | null> {
    const record = await this.getBlob(id);
    return record?.blob ?? null;
  }

  /**
   * Create a blob URL for rendering.
   * Remember to revoke when done using URL.revokeObjectURL().
   */
  async createBlobUrl(id: string): Promise<string | null> {
    const blob = await this.getBlobData(id);
    return blob ? URL.createObjectURL(blob) : null;
  }

  /**
   * Check if a blob exists locally.
   */
  async hasBlob(id: string): Promise<boolean> {
    try {
      const count = await attachmentsDb.blobs.where('id').equals(id).count();
      return count > 0;
    } catch (error) {
      Sentry.captureException(error);
      return false;
    }
  }

  /**
   * Delete blobs by IDs.
   */
  async deleteBlobs(ids: string[]): Promise<void> {
    try {
      await attachmentsDb.blobs.bulkDelete(ids);
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to delete blobs:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UPLOAD SYNC
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get pending uploads for an organization.
   */
  async getPendingUploads(organizationId: string): Promise<AttachmentBlob[]> {
    try {
      return await attachmentsDb.blobs
        .where('[organizationId+syncStatus]')
        .equals([organizationId, 'pending'])
        .toArray();
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to get pending uploads:', error);
      return [];
    }
  }

  /**
   * Get uploads needing sync (pending or failed with retry available).
   */
  async getUploadsNeedingSync(organizationId: string): Promise<AttachmentBlob[]> {
    try {
      const now = new Date();

      // Get pending uploads
      const pending = await attachmentsDb.blobs
        .where('[organizationId+syncStatus]')
        .equals([organizationId, 'pending'])
        .toArray();

      // Get failed uploads ready for retry
      const config = appConfig.localBlobStorage;
      const maxRetries = config?.uploadRetryAttempts ?? 3;

      const retryReady = await attachmentsDb.blobs
        .where('[organizationId+syncStatus]')
        .equals([organizationId, 'failed'])
        .filter(
          (blob) =>
            blob.source === 'upload' &&
            blob.syncAttempts < maxRetries &&
            (!blob.nextRetryAt || blob.nextRetryAt <= now),
        )
        .toArray();

      return [...pending, ...retryReady];
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to get uploads needing sync:', error);
      return [];
    }
  }

  /**
   * Update sync status for a blob.
   */
  async updateSyncStatus(id: string, status: SyncStatus, error?: string): Promise<void> {
    try {
      const updates: Partial<AttachmentBlob> = { syncStatus: status };

      if (status === 'failed' && error) {
        const blob = await attachmentsDb.blobs.get(id);
        if (blob) {
          updates.syncAttempts = blob.syncAttempts + 1;
          updates.lastError = error;

          // Exponential backoff using config
          const config = appConfig.localBlobStorage;
          const delays = config?.uploadRetryDelays ?? [60000, 300000, 900000];
          const delay = delays[Math.min(blob.syncAttempts, delays.length - 1)];
          updates.nextRetryAt = new Date(Date.now() + delay);
        }
      }

      if (status === 'synced') {
        updates.lastError = null;
        updates.nextRetryAt = null;
      }

      await attachmentsDb.blobs.update(id, updates);
    } catch (error) {
      Sentry.captureException(error);
      console.error(`Failed to update sync status (${id}):`, error);
      throw error;
    }
  }

  /**
   * Mark upload as syncing.
   */
  async markSyncing(id: string): Promise<void> {
    await this.updateSyncStatus(id, 'syncing');
  }

  /**
   * Mark upload as synced (successfully uploaded to cloud).
   */
  async markSynced(id: string): Promise<void> {
    await this.updateSyncStatus(id, 'synced');
  }

  /**
   * Mark upload as failed with error.
   */
  async markFailed(id: string, error: string): Promise<void> {
    await this.updateSyncStatus(id, 'failed', error);
  }

  /**
   * Reset failed uploads to pending for manual retry.
   */
  async resetFailedUploads(organizationId: string): Promise<void> {
    try {
      await attachmentsDb.blobs
        .where('[organizationId+syncStatus]')
        .equals([organizationId, 'failed'])
        .filter((blob) => blob.source === 'upload')
        .modify({
          syncStatus: 'pending',
          syncAttempts: 0,
          nextRetryAt: null,
          lastError: null,
        });
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to reset failed uploads:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DOWNLOAD QUEUE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Queue attachments for download (offline caching).
   */
  async queueForDownload(attachments: Attachment[], organizationId: string): Promise<void> {
    if (!attachments.length) return;

    const config = appConfig.localBlobStorage;
    if (!config?.enabled) return;

    try {
      // Filter out already queued or cached
      const existingBlobIds = new Set(
        await attachmentsDb.blobs.where('organizationId').equals(organizationId).primaryKeys(),
      );

      const existingQueueIds = new Set(
        await attachmentsDb.downloadQueue.where('organizationId').equals(organizationId).primaryKeys(),
      );

      const entries: DownloadQueueEntry[] = [];

      for (const attachment of attachments) {
        // Skip if already cached or queued
        if (existingBlobIds.has(attachment.id) || existingQueueIds.has(attachment.id)) continue;

        // Apply filters
        const skipReason = this.shouldSkipDownload(attachment, config);

        entries.push({
          id: attachment.id,
          organizationId,
          priority: this.calculatePriority(attachment),
          status: skipReason ? 'skipped' : 'pending',
          skipReason,
          queuedAt: new Date(),
          attempts: 0,
        });
      }

      if (entries.length > 0) {
        await attachmentsDb.downloadQueue.bulkAdd(entries);
      }
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to queue attachments for download:', error);
    }
  }

  /**
   * Get pending downloads for an organization.
   */
  async getPendingDownloads(organizationId: string, limit?: number): Promise<DownloadQueueEntry[]> {
    try {
      let query = attachmentsDb.downloadQueue
        .where('[organizationId+status]')
        .equals([organizationId, 'pending'])
        .sortBy('priority');

      const results = await query;
      return limit ? results.slice(0, limit) : results;
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to get pending downloads:', error);
      return [];
    }
  }

  /**
   * Update download queue entry status.
   */
  async updateDownloadStatus(id: string, status: QueueStatus, skipReason?: string): Promise<void> {
    try {
      const updates: Partial<DownloadQueueEntry> = { status };
      if (skipReason) updates.skipReason = skipReason;
      if (status === 'downloading' || status === 'failed') {
        const entry = await attachmentsDb.downloadQueue.get(id);
        if (entry) updates.attempts = entry.attempts + 1;
      }
      await attachmentsDb.downloadQueue.update(id, updates);
    } catch (error) {
      Sentry.captureException(error);
      console.error(`Failed to update download status (${id}):`, error);
    }
  }

  /**
   * Remove completed/skipped entries from queue (cleanup).
   */
  async cleanupDownloadQueue(organizationId: string): Promise<void> {
    try {
      await attachmentsDb.downloadQueue
        .where('organizationId')
        .equals(organizationId)
        .filter((entry) => entry.status === 'completed' || entry.status === 'skipped')
        .delete();
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to cleanup download queue:', error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STORAGE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get total storage used by blobs for an organization.
   */
  async getStorageUsed(organizationId: string): Promise<number> {
    try {
      const blobs = await attachmentsDb.blobs.where('organizationId').equals(organizationId).toArray();
      return blobs.reduce((total, blob) => total + blob.size, 0);
    } catch (error) {
      Sentry.captureException(error);
      return 0;
    }
  }

  /**
   * Get blobs by source type for an organization.
   */
  async getBlobsBySource(organizationId: string, source: BlobSource): Promise<AttachmentBlob[]> {
    try {
      return await attachmentsDb.blobs.where('[organizationId+source]').equals([organizationId, source]).toArray();
    } catch (error) {
      Sentry.captureException(error);
      return [];
    }
  }

  /**
   * Clear all blobs for an organization (for logout/cleanup).
   */
  async clearOrganizationBlobs(organizationId: string): Promise<void> {
    try {
      await attachmentsDb.blobs.where('organizationId').equals(organizationId).delete();
      await attachmentsDb.downloadQueue.where('organizationId').equals(organizationId).delete();
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to clear organization blobs:', error);
      throw error;
    }
  }

  /**
   * Clear downloaded blobs only (keep pending uploads).
   */
  async clearDownloadedBlobs(organizationId: string): Promise<void> {
    try {
      await attachmentsDb.blobs.where('[organizationId+source]').equals([organizationId, 'download']).delete();
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to clear downloaded blobs:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Check if attachment should be skipped based on config filters.
   */
  private shouldSkipDownload(attachment: Attachment, config: typeof appConfig.localBlobStorage): string | null {
    if (!config) return 'Config not available';

    // Check file size (attachment.size is a string in the API)
    const fileSize = attachment.size ? Number(attachment.size) : 0;
    if (config.maxFileSize && fileSize && fileSize > config.maxFileSize) {
      return `File too large (${Math.round(fileSize / 1024 / 1024)}MB > ${Math.round(config.maxFileSize / 1024 / 1024)}MB)`;
    }

    // Check excluded content types (with wildcard support)
    if (config.excludedContentTypes?.length && attachment.contentType) {
      for (const pattern of config.excludedContentTypes) {
        if (this.matchesMimePattern(attachment.contentType, pattern)) {
          return `Content type excluded: ${attachment.contentType}`;
        }
      }
    }

    // Check allowed content types (if specified)
    if (config.allowedContentTypes?.length && attachment.contentType) {
      const allowed = config.allowedContentTypes.some((pattern) =>
        this.matchesMimePattern(attachment.contentType!, pattern),
      );
      if (!allowed) {
        return `Content type not allowed: ${attachment.contentType}`;
      }
    }

    return null;
  }

  /**
   * Match MIME type against pattern (supports wildcards like 'video/*').
   */
  private matchesMimePattern(mimeType: string, pattern: string): boolean {
    if (pattern === '*' || pattern === '*/*') return true;
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      return mimeType.startsWith(`${prefix}/`);
    }
    return mimeType === pattern;
  }

  /**
   * Calculate download priority (lower = higher priority).
   * Images get higher priority than documents, etc.
   */
  private calculatePriority(attachment: Attachment): number {
    const type = attachment.contentType || '';
    if (type.startsWith('image/')) return 1;
    if (type.startsWith('audio/')) return 2;
    if (type === 'application/pdf') return 3;
    if (type.startsWith('text/')) return 4;
    if (type.startsWith('video/')) return 10; // Low priority for videos
    return 5;
  }
}

export const attachmentStorage = new AttachmentStorageService();
