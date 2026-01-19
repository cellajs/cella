import * as Sentry from '@sentry/react';
import { Attachment, getPresignedUrl } from '~/api.gen';
import {
  AttachmentFile,
  attachmentsDb,
  CachedAttachment,
  SyncStatus,
} from '~/modules/attachments/dexie/attachments-db';
import { CustomUppyFile } from '~/modules/common/uploader/types';
import { UploadTokenQuery } from '~/modules/me/types';
import { nanoid } from '~/utils/nanoid';

/**
 * Dexie-based attachment storage service with enhanced offline capabilities
 */
export class DexieAttachmentStorage {
  /**
   * Add files to a batch for offline storage
   */
  async addFiles(files: Record<string, CustomUppyFile>, tokenQuery: UploadTokenQuery): Promise<void> {
    if (!tokenQuery.organizationId) throw new Error('No organizationId provided');
    const now = new Date();
    const organizationId = tokenQuery.organizationId;
    try {
      // Add file records
      const fileRecords: AttachmentFile = {
        id: nanoid(8),
        files,
        organizationId,
        tokenQuery,
        syncStatus: 'idle' as SyncStatus,
        createdAt: now,
        updatedAt: now,
        syncAttempts: 0,
        maxRetries: 3,
      };
      await attachmentsDb.attachmentFiles.add(fileRecords);
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to save offline uploaded files:', error);
      throw error;
    }
  }
  /**
   * Get all files for an organization
   */
  async getFilesByOrganization(organizationId: string): Promise<AttachmentFile[]> {
    try {
      return await attachmentsDb.attachmentFiles.where('organizationId').equals(organizationId).toArray();
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to retrieve files:', error);
      return [];
    }
  }

  // /**
  //  * Get files by sync status for an organization
  //  */
  // async getFilesBySyncStatus(organizationId: string, syncStatus: SyncStatus): Promise<AttachmentFile[]> {
  //   try {
  //     return await attachmentsDb.attachmentFiles.where('[organizationId+syncStatus]').equals([organizationId, syncStatus]).toArray();
  //   } catch (error) {
  //     Sentry.captureException(error);
  //     console.error('Failed to retrieve files by sync status:', error);
  //     return [];
  //   }
  // }
  // /**
  //  * Get a specific file by ID
  //  */
  // async getFile(fileId: string): Promise<AttachmentFile | undefined> {
  //   try {
  //     return await attachmentsDb.attachmentFiles.where('fileId').equals(fileId).first();
  //   } catch (error) {
  //     Sentry.captureException(error);
  //     console.error(`Failed to retrieve file (${fileId}):`, error);
  //     return undefined;
  //   }
  // }
  /**
   * Update sync status for a files
   */
  async updateFilesSyncStatus(organizationId: string, syncStatus: SyncStatus): Promise<void> {
    const now = new Date();
    try {
      // Update all files in batch
      await attachmentsDb.attachmentFiles.where('organizationId').equals(organizationId).modify({
        syncStatus,
        updatedAt: now,
      });
    } catch (error) {
      Sentry.captureException(error);
      console.error(`Failed to update files sync status for org: ${organizationId} | `, error);
      throw error;
    }
  }

  // /**
  //  * Update file name
  //  */
  // async updateFileName(fileId: string, newName: string): Promise<AttachmentFile | undefined> {
  //   try {
  //     await attachmentsDb.attachmentFiles
  //       .where('fileId')
  //       .equals(fileId)
  //       .modify((file) => {
  //         file.file.name = newName;
  //         file.updatedAt = new Date();
  //       });
  //     return await this.getFile(fileId);
  //   } catch (error) {
  //     Sentry.captureException(error);
  //     console.error(`Failed to update file name (${fileId}):`, error);
  //     return undefined;
  //   }
  // }
  /**
   * Remove files by IDs
   */
  async removeFiles(files: AttachmentFile[]): Promise<void> {
    try {
      const ids = files.map(({ id }) => id);

      await attachmentsDb.attachmentFiles.where('id').anyOf(ids).delete();
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to remove files:', error);
      throw error;
    }
  }
  /**
   * Get files needing sync (idle status or ready for retry)
   */
  async getFilesNeedingSync(organizationId: string): Promise<AttachmentFile[]> {
    try {
      const now = new Date();

      // Get idle files
      const idleFiles = await attachmentsDb.attachmentFiles
        .where('[organizationId+syncStatus]')
        .equals([organizationId, 'idle'])
        .toArray();

      // Get failed files that are ready for retry
      const retryFiles = await attachmentsDb.attachmentFiles
        .where('[organizationId+syncStatus]')
        .equals([organizationId, 'failed'])
        .filter((file) => file.syncAttempts < file.maxRetries && (!file.nextRetryAt || file.nextRetryAt <= now))
        .toArray();

      return [...idleFiles, ...retryFiles];
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to get local files that needing sync:', error);
      return [];
    }
  }

  /**
   * Mark file as failed and schedule retry with exponential backoff
   */
  async markFileForRetry(fileId: string): Promise<void> {
    try {
      const file = await attachmentsDb.attachmentFiles.where('id').equals(fileId).first();
      if (!file) return;

      const newAttemptCount = file.syncAttempts + 1;
      const isLastAttempt = newAttemptCount >= file.maxRetries;

      // Exponential backoff: 1min, 5min, 15min
      const retryDelays = [60000, 300000, 900000];
      const delay = retryDelays[Math.min(newAttemptCount - 1, retryDelays.length - 1)];
      const nextRetryAt = newAttemptCount < file.maxRetries ? new Date(Date.now() + delay) : undefined;

      await attachmentsDb.attachmentFiles
        .where('id')
        .equals(fileId)
        .modify({
          syncStatus: isLastAttempt ? 'failed' : 'idle',
          syncAttempts: newAttemptCount,
          lastSyncAttempt: new Date(),
          nextRetryAt,
          updatedAt: new Date(),
        });
    } catch (error) {
      Sentry.captureException(error);
      console.error(`Failed to mark file for retry (${fileId}):`, error);
      throw error;
    }
  }

  /**
   * Reset failed files to idle for manual retry
   */
  async resetFailedFiles(organizationId: string): Promise<void> {
    try {
      await attachmentsDb.attachmentFiles
        .where('[organizationId+syncStatus]')
        .equals([organizationId, 'failed'])
        .modify({
          syncStatus: 'idle',
          syncAttempts: 0,
          nextRetryAt: undefined,
          updatedAt: new Date(),
        });
    } catch (error) {
      Sentry.captureException(error);
      console.error(`Failed to reset failed files for org: ${organizationId}:`, error);
      throw error;
    }
  }

  /**
   * Store a cached image
   */
  async addCachedImage(attachments: Attachment[]): Promise<void> {
    if (!attachments.length) return;

    try {
      // Deduplicate attachments by ID to avoid downloading the same image multiple times
      const uniqueAttachments = attachments.filter(
        (attachment, index, self) => self.findIndex((a) => a.id === attachment.id) === index,
      );

      // Check which attachments are already cached
      const existingIds = await attachmentsDb.attachmentCache
        .where('id')
        .anyOf(uniqueAttachments.map((a) => a.id))
        .primaryKeys();
      const existingIdSet = new Set(existingIds);
      const attachmentsToCache = uniqueAttachments.filter((a) => !existingIdSet.has(a.id));

      if (!attachmentsToCache.length) {
        console.info('All attachments already cached');
        return;
      }

      // Process attachments in smaller batches with delays to avoid rate limiting
      const BATCH_SIZE = 3;
      const BATCH_DELAY_MS = 500;
      const filesToAdd: CachedAttachment[] = [];

      for (let i = 0; i < attachmentsToCache.length; i += BATCH_SIZE) {
        const batch = attachmentsToCache.slice(i, i + BATCH_SIZE);

        // Add delay between batches (except for the first batch)
        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
        }

        const batchPromises = batch.map(
          async ({ id, name, groupId, contentType, originalKey: key, public: isPublic }) => {
            try {
              const imageUrl = await getPresignedUrl({ query: { key, isPublic } });

              // Download with better error handling and timeout
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

              const imageResponse = await fetch(imageUrl, {
                signal: controller.signal,
                headers: { 'Cache-Control': 'public, max-age=31536000' }, // Leverage browser cache
              });

              clearTimeout(timeoutId);

              //TODO switch to apiError
              if (!imageResponse.ok) throw new Error(`HTTP ${imageResponse.status}: ${imageResponse.statusText}`);

              const blob = await imageResponse.blob();

              // Create file with better type handling
              const finalContentType = contentType || blob.type || 'application/octet-stream';
              const file = new File([blob], name || `image-${id}`, {
                type: finalContentType,
                lastModified: Date.now(),
              });

              return { id, file, groupId };
            } catch (error) {
              // Log individual failures but continue processing others
              console.warn(`Failed to cache image ${id}:`, error instanceof Error ? error.message : error);
              return null; // Return null for failed downloads
            }
          },
        );

        const batchResults = await Promise.all(batchPromises);

        // Filter out null results and add to files array
        const successfulFiles = batchResults.filter((result): result is CachedAttachment => result !== null);

        filesToAdd.push(...successfulFiles);
      }

      // Only store if we have successful files
      if (filesToAdd.length > 0) {
        // Use bulkPut instead of bulkAdd to handle potential duplicates gracefully
        await attachmentsDb.attachmentCache.bulkPut(filesToAdd);

        console.info(`Successfully cached ${filesToAdd.length}/${attachmentsToCache.length} images`);
      } else {
        console.warn('No images were cached');
      }
    } catch (error) {
      Sentry.captureException(error);
      console.error(`Failed to cache images:`, error);
      throw error;
    }
  }

  /**
   * Get a cached images by groupId
   */
  async getCachedImages(id: string, groupId?: string | null): Promise<CachedAttachment[]> {
    try {
      if (!groupId) return attachmentsDb.attachmentCache.where('id').equals(id).toArray();
      return attachmentsDb.attachmentCache.where('groupId').equals(groupId).toArray();
    } catch (error) {
      Sentry.captureException(error);
      console.error(`Failed to retrieve cached image${groupId ? `s groupId: ${groupId}` : ` id:${id}`} | `, error);
      return [];
    }
  }

  /**
   * Delete a cached image file
   */
  async deleteCachedImages(ids: string[]): Promise<void> {
    try {
      await attachmentsDb.attachmentCache.bulkDelete(ids);
    } catch (error) {
      Sentry.captureException(error);
      console.error(`Failed to delete cached images (${ids}):`, error);
      throw error;
    }
  }

  // /**
  //  * Check if an image is cached
  //  */
  // async isImageCached(id: string): Promise<boolean> {
  //   try {
  //     const count = await attachmentsDb.attachmentCache.where('id').equals(id).count();
  //     return count > 0;
  //   } catch (error) {
  //     Sentry.captureException(error);
  //     console.error(`Failed to check if image is cached (${id}):`, error);
  //     return false;
  //   }
  // }
}

export const attachmentStorage = new DexieAttachmentStorage();
