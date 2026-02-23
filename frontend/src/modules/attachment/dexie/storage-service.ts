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
import { appConfig } from 'shared';
import type { Attachment } from '~/api.gen';
import {
  type AttachmentBlob,
  attachmentsDb,
  type BlobSource,
  type BlobVariant,
  type DownloadQueueEntry,
  type DownloadStatus,
  makeBlobKey,
  parseBlobKey,
  type UploadContext,
  type UploadStatus,
} from '~/modules/attachment/dexie/attachments-db';
import type { CustomUppyFile } from '~/modules/common/uploader/types';

/** Fallback chain for blob resolution - try these variants in order */
const displayFallbackChain: BlobVariant[] = ['converted', 'original', 'raw'];
const thumbnailFallbackChain: BlobVariant[] = ['thumbnail', 'original', 'raw'];

/**
 * Attachment storage service with local-first capabilities.
 */
class AttachmentStorageService {
  /**
   * Get a blob by attachment ID and variant, with optional fallback chain.
   */
  async getBlobWithVariant(
    attachmentId: string,
    variant: BlobVariant,
    useFallback = false,
  ): Promise<{ blob: AttachmentBlob; actualVariant: BlobVariant } | null> {
    const chain = useFallback ? (variant === 'thumbnail' ? thumbnailFallbackChain : displayFallbackChain) : [variant];

    for (const v of chain) {
      const key = makeBlobKey(attachmentId, v);
      const blob = await this.getBlob(key);
      if (blob) {
        return { blob, actualVariant: v };
      }
    }
    return null;
  }

  /**
   * Create a blob URL for a specific variant with fallback.
   * Returns the URL and which variant was actually used.
   */
  async createBlobUrlWithVariant(
    attachmentId: string,
    variant: BlobVariant,
    useFallback = true,
  ): Promise<{ url: string; actualVariant: BlobVariant } | null> {
    const result = await this.getBlobWithVariant(attachmentId, variant, useFallback);
    if (!result) return null;

    const url = URL.createObjectURL(result.blob.blob);
    return { url, actualVariant: result.actualVariant };
  }

  /**
   * Store a downloaded blob with variant.
   */
  async storeDownloadBlobWithVariant(
    attachmentId: string,
    variant: BlobVariant,
    organizationId: string,
    blob: Blob,
    contentType: string,
  ): Promise<AttachmentBlob> {
    const key = makeBlobKey(attachmentId, variant);

    const record: AttachmentBlob = {
      id: key,
      attachmentId,
      variant,
      organizationId,
      blob,
      size: blob.size,
      contentType,
      source: 'download',
      uploadStatus: 'uploaded',
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
   * Evict raw blob after processed version is available.
   * Call this when 'original' variant is successfully downloaded.
   */
  async evictRawBlob(attachmentId: string): Promise<boolean> {
    const rawKey = makeBlobKey(attachmentId, 'raw');
    try {
      const exists = await attachmentsDb.blobs.get(rawKey);
      if (exists) {
        await attachmentsDb.blobs.delete(rawKey);
        console.debug(`[Storage] Evicted raw blob for ${attachmentId}`);
        return true;
      }
      return false;
    } catch (error) {
      Sentry.captureException(error);
      console.error(`Failed to evict raw blob (${attachmentId}):`, error);
      return false;
    }
  }

  /**
   * Check if any variant of an attachment exists locally.
   */
  async hasAnyVariant(attachmentId: string): Promise<BlobVariant | null> {
    for (const variant of ['original', 'converted', 'thumbnail', 'raw'] as BlobVariant[]) {
      const key = makeBlobKey(attachmentId, variant);
      const exists = await attachmentsDb.blobs.get(key);
      if (exists) return variant;
    }
    return null;
  }

  /**
   * Get all variants stored for an attachment.
   */
  async getStoredVariants(attachmentId: string): Promise<BlobVariant[]> {
    try {
      const blobs = await attachmentsDb.blobs.where('attachmentId').equals(attachmentId).toArray();
      return blobs.map((b) => b.variant);
    } catch (error) {
      Sentry.captureException(error);
      return [];
    }
  }

  /** Store a blob from Uppy file upload (stores as 'raw' variant). */
  async storeUploadBlob(
    file: CustomUppyFile,
    organizationId: string,
    uploadStatus: UploadStatus = 'pending',
    uploadContext?: UploadContext,
    attachmentId?: string,
  ): Promise<AttachmentBlob> {
    // Validate file has blob data
    if (!file.data || !(file.data instanceof Blob)) {
      throw new Error('File data must be a Blob');
    }

    const blobData = file.data;
    const size = file.size ?? blobData.size ?? 0;

    // Use provided attachmentId or fall back to file.id for temp storage
    const actualAttachmentId = attachmentId || file.id;
    const key = makeBlobKey(actualAttachmentId, 'raw');

    const blob: AttachmentBlob = {
      id: key,
      attachmentId: actualAttachmentId,
      variant: 'raw',
      organizationId,
      blob: blobData,
      filename: file.name || undefined,
      uploadContext,
      size,
      contentType: file.type || 'application/octet-stream',
      source: 'upload',
      uploadStatus,
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
   * @deprecated Use storeDownloadBlobWithVariant for variant-aware storage
   */
  async storeDownloadBlob(
    id: string,
    organizationId: string,
    blob: Blob,
    contentType: string,
  ): Promise<AttachmentBlob> {
    // Parse the id to extract attachmentId - for backwards compat, assume 'original' if no variant
    const parsed = id.includes(':') ? null : { attachmentId: id, variant: 'original' as BlobVariant };
    const attachmentId = parsed?.attachmentId || id;
    const variant: BlobVariant = 'original';
    const key = makeBlobKey(attachmentId, variant);

    const record: AttachmentBlob = {
      id: key,
      attachmentId,
      variant,
      organizationId,
      blob,
      size: blob.size,
      contentType,
      source: 'download',
      uploadStatus: 'uploaded', // Downloaded = already uploaded to cloud
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
   * Get a blob by composite key (id:variant format).
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
   * Get blob data for rendering by composite key.
   */
  async getBlobData(id: string): Promise<Blob | null> {
    const record = await this.getBlob(id);
    return record?.blob ?? null;
  }

  /**
   * Create a blob URL for rendering by composite key.
   * Remember to revoke when done using URL.revokeObjectURL().
   * @deprecated Use createBlobUrlWithVariant for variant-aware URL creation
   */
  async createBlobUrl(id: string): Promise<string | null> {
    const blob = await this.getBlobData(id);
    return blob ? URL.createObjectURL(blob) : null;
  }

  /**
   * Check if a blob exists locally by composite key.
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
   * Delete blobs by attachment IDs (deletes all variants).
   */
  async deleteBlobs(ids: string[]): Promise<void> {
    try {
      // Delete all variants for each attachment ID
      for (const id of ids) {
        await attachmentsDb.blobs.where('attachmentId').equals(id).delete();
      }
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to delete blobs:', error);
      throw error;
    }
  }

  /**
   * Delete blobs by composite keys directly.
   */
  async deleteBlobsByKeys(keys: string[]): Promise<void> {
    try {
      await attachmentsDb.blobs.bulkDelete(keys);
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to delete blobs by keys:', error);
      throw error;
    }
  }

  /** Get pending uploads for an organization. */
  async getPendingUploads(organizationId: string): Promise<AttachmentBlob[]> {
    try {
      return await attachmentsDb.blobs
        .where('[organizationId+uploadStatus]')
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
        .where('[organizationId+uploadStatus]')
        .equals([organizationId, 'pending'])
        .toArray();

      // Get failed uploads ready for retry
      const config = appConfig.localBlobStorage;
      const maxRetries = config?.uploadRetryAttempts ?? 3;

      const retryReady = await attachmentsDb.blobs
        .where('[organizationId+uploadStatus]')
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
   * Update upload status for a blob.
   */
  async updateUploadStatus(id: string, status: UploadStatus, error?: string): Promise<void> {
    try {
      const updates: Partial<AttachmentBlob> = { uploadStatus: status };

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

      if (status === 'uploaded') {
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
   * Mark upload as uploading.
   */
  async markUploading(id: string): Promise<void> {
    await this.updateUploadStatus(id, 'uploading');
  }

  /**
   * Mark upload as uploaded (successfully uploaded to cloud).
   */
  async markUploaded(id: string): Promise<void> {
    await this.updateUploadStatus(id, 'uploaded');
  }

  /**
   * Mark upload as failed with error.
   */
  async markFailed(id: string, error: string): Promise<void> {
    await this.updateUploadStatus(id, 'failed', error);
  }

  /**
   * Reset failed uploads to pending for manual retry.
   */
  async resetFailedUploads(organizationId: string): Promise<void> {
    try {
      await attachmentsDb.blobs
        .where('[organizationId+uploadStatus]')
        .equals([organizationId, 'failed'])
        .filter((blob) => blob.source === 'upload')
        .modify({
          uploadStatus: 'pending',
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

  /** Queue attachments for download (offline caching). */
  async queueForDownload(attachments: Attachment[], organizationId: string): Promise<void> {
    if (!attachments.length) return;

    const config = appConfig.localBlobStorage;
    if (!config?.enabled) return;

    try {
      // Get existing blob attachmentIds (need to extract from composite keys)
      const existingBlobKeys = await attachmentsDb.blobs.where('organizationId').equals(organizationId).primaryKeys();
      const existingBlobAttachmentIds = new Set(
        existingBlobKeys.map((key) => {
          const parsed = parseBlobKey(key);
          return parsed?.attachmentId ?? key;
        }),
      );

      // Get existing queue entries (keyed by attachment id)
      const existingQueueEntries = await attachmentsDb.downloadQueue
        .where('organizationId')
        .equals(organizationId)
        .toArray();
      const queueEntriesById = new Map(existingQueueEntries.map((e) => [e.id, e]));

      const entries: DownloadQueueEntry[] = [];
      const resetIds: string[] = [];

      for (const attachment of attachments) {
        // Skip if blob already cached for display (original/converted/thumbnail)
        if (existingBlobAttachmentIds.has(attachment.id)) {
          // Check if it's just raw - if so, we still need to download processed versions
          const variants = await this.getStoredVariants(attachment.id);
          const hasProcessedVariant = variants.some((v) => v !== 'raw');
          if (hasProcessedVariant) continue;
        }

        const existingEntry = queueEntriesById.get(attachment.id);

        if (existingEntry) {
          // Re-queue if skipped due to missing keys but now has keys
          if (
            existingEntry.status === 'skipped' &&
            existingEntry.skipReason === 'No originalKey' &&
            attachment.originalKey
          ) {
            resetIds.push(attachment.id);
          }
          continue;
        }

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

      // Add new entries
      if (entries.length > 0) {
        await attachmentsDb.downloadQueue.bulkAdd(entries);
      }

      // Reset skipped entries that now have keys
      if (resetIds.length > 0) {
        await attachmentsDb.downloadQueue.where('id').anyOf(resetIds).modify({ status: 'pending', skipReason: null });
        console.debug(`[Storage] Reset ${resetIds.length} skipped entries for re-download`);
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
  async updateDownloadStatus(id: string, status: DownloadStatus, skipReason?: string): Promise<void> {
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
   * Remove downloaded/skipped entries from queue (cleanup).
   */
  async cleanupDownloadQueue(organizationId: string): Promise<void> {
    try {
      await attachmentsDb.downloadQueue
        .where('organizationId')
        .equals(organizationId)
        .filter((entry) => entry.status === 'downloaded' || entry.status === 'skipped')
        .delete();
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to cleanup download queue:', error);
    }
  }

  /** Get total storage used by blobs for an organization. */
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

  /** Check if attachment should be skipped based on config filters. */
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
