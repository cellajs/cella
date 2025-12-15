import * as Sentry from '@sentry/react';
import { Attachment, getPresignedUrl } from '~/api.gen';
import { AttachmentFile, attachmentDb, CachedAttachment, SyncStatus } from '~/modules/attachments/dexie/attachment-db';
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
    const batchId = nanoid(8);
    const now = new Date();
    const organizationId = tokenQuery.organizationId;
    try {
      // Add file records
      const fileRecords: AttachmentFile[] = Object.entries(files).map(([fileId, file]) => ({
        fileId,
        file,
        organizationId,
        batchId,
        tokenQuery,
        syncStatus: 'idle' as SyncStatus,
        createdAt: now,
        updatedAt: now,
      }));
      await attachmentDb.attachmentFiles.bulkAdd(fileRecords);
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
      return await attachmentDb.attachmentFiles.where('organizationId').equals(organizationId).toArray();
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
  //     return await attachmentDb.attachmentFiles.where('[organizationId+syncStatus]').equals([organizationId, syncStatus]).toArray();
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
  //     return await attachmentDb.attachmentFiles.where('fileId').equals(fileId).first();
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
      await attachmentDb.attachmentFiles.where('organizationId').equals(organizationId).modify({
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
  //     await attachmentDb.attachmentFiles
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
  async removeFiles(fileIds: string[]): Promise<void> {
    try {
      await attachmentDb.attachmentFiles.where('fileId').anyOf(fileIds).delete();
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to remove files:', error);
      throw error;
    }
  }
  /**
   * Get files needing sync (idle status)
   */
  async getFilesNeedingSync(organizationId: string): Promise<AttachmentFile[]> {
    try {
      return await attachmentDb.attachmentFiles.where('[organizationId+syncStatus]').equals([organizationId, 'idle']).toArray();
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to get local files that needing sync:', error);
      return [];
    }
  }

  /**
   * Store a cached image
   */
  async addCachedImage(attachments: Attachment[]): Promise<void> {
    if (!attachments.length) return;

    try {
      // Deduplicate attachments by ID to avoid downloading the same image multiple times
      const uniqueAttachments = attachments.filter((attachment, index, self) => self.findIndex((a) => a.id === attachment.id) === index);

      // Process attachments in batches to control memory usage
      const BATCH_SIZE = 5;
      const filesToAdd: CachedAttachment[] = [];

      for (let i = 0; i < uniqueAttachments.length; i += BATCH_SIZE) {
        const batch = uniqueAttachments.slice(i, i + BATCH_SIZE);

        const batchPromises = batch.map(async ({ id, name, groupId, contentType, originalKey: key, public: isPublic }) => {
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
        });

        const batchResults = await Promise.all(batchPromises);

        // Filter out null results and add to files array
        const successfulFiles = batchResults.filter((result): result is CachedAttachment => result !== null);

        filesToAdd.push(...successfulFiles);
      }

      // Only store if we have successful files
      if (filesToAdd.length > 0) {
        // Use bulkPut instead of bulkAdd to handle potential duplicates gracefully
        await attachmentDb.attachmentCache.bulkPut(filesToAdd);

        console.log(`Successfully cached ${filesToAdd.length}/${uniqueAttachments.length} images`);
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
      if (!groupId) return attachmentDb.attachmentCache.where('id').equals(id).toArray();
      return attachmentDb.attachmentCache.where('groupId').equals(groupId).toArray();
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
      await attachmentDb.attachmentCache.bulkDelete(ids);
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
  //     const count = await attachmentDb.attachmentCache.where('id').equals(id).count();
  //     return count > 0;
  //   } catch (error) {
  //     Sentry.captureException(error);
  //     console.error(`Failed to check if image is cached (${id}):`, error);
  //     return false;
  //   }
  // }
}

export const attachmentStorage = new DexieAttachmentStorage();
