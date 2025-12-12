import * as Sentry from '@sentry/react';
import { Attachment, getPresignedUrl } from '~/api.gen';
import { attachmentDb, CachedAttachment } from '../db/attachment-db';

/**
 * Dexie-based attachment storage service with enhanced offline capabilities
 */
export class DexieAttachmentStorage {
  // /**
  //  * Add files to a batch for offline storage
  //  */
  // async addFiles(files: Record<string, CustomUppyFile>, tokenQuery: UploadTokenQuery): Promise<string> {
  //   if (!tokenQuery.organizationId) throw new Error('No organizationId provided');
  //   const batchId = nanoid(8);
  //   const now = new Date();
  //   const organizationId = tokenQuery.organizationId;
  //   try {
  //     await attachmentDb.transaction('rw', attachmentDb.attachmentBatches, attachmentDb.attachmentFiles, async () => {
  //       // Create batch record
  //       await attachmentDb.attachmentBatches.add({
  //         batchId,
  //         organizationId,
  //         tokenQuery,
  //         syncStatus: 'idle',
  //         fileCount: Object.keys(files).length,
  //         createdAt: now,
  //         updatedAt: now,
  //       });
  //       // Add file records
  //       const fileRecords: AttachmentFile[] = Object.entries(files).map(([fileId, file]) => ({
  //         fileId,
  //         file,
  //         organizationId,
  //         batchId,
  //         tokenQuery,
  //         syncStatus: 'idle' as SyncStatus,
  //         createdAt: now,
  //         updatedAt: now,
  //       }));
  //       await attachmentDb.attachmentFiles.bulkAdd(fileRecords);
  //     });
  //     return batchId;
  //   } catch (error) {
  //     Sentry.captureException(error);
  //     console.error('Failed to save files:', error);
  //     throw error;
  //   }
  // }
  // /**
  //  * Get all files for an organization
  //  */
  // async getFilesByOrganization(organizationId: string): Promise<AttachmentFile[]> {
  //   try {
  //     return await attachmentDb.attachmentFiles.where('organizationId').equals(organizationId).toArray();
  //   } catch (error) {
  //     Sentry.captureException(error);
  //     console.error('Failed to retrieve files:', error);
  //     return [];
  //   }
  // }
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
  // /**
  //  * Get batch information
  //  */
  // async getBatch(batchId: string): Promise<AttachmentBatch | undefined> {
  //   try {
  //     return await attachmentDb.attachmentBatches.where('batchId').equals(batchId).first();
  //   } catch (error) {
  //     Sentry.captureException(error);
  //     console.error(`Failed to retrieve batch (${batchId}):`, error);
  //     return undefined;
  //   }
  // }
  // /**
  //  * Get all files in a batch
  //  */
  // async getBatchFiles(batchId: string): Promise<AttachmentFile[]> {
  //   try {
  //     return await attachmentDb.attachmentFiles.where('batchId').equals(batchId).toArray();
  //   } catch (error) {
  //     Sentry.captureException(error);
  //     console.error(`Failed to retrieve batch files (${batchId}):`, error);
  //     return [];
  //   }
  // }
  // /**
  //  * Update sync status for a batch
  //  */
  // async updateBatchSyncStatus(batchId: string, syncStatus: SyncStatus, errorMessage?: string): Promise<void> {
  //   const now = new Date();
  //   try {
  //     await attachmentDb.transaction('rw', attachmentDb.attachmentBatches, attachmentDb.attachmentFiles, async () => {
  //       // Update batch
  //       await attachmentDb.attachmentBatches
  //         .where('batchId')
  //         .equals(batchId)
  //         .modify({
  //           syncStatus,
  //           updatedAt: now,
  //           ...(syncStatus === 'synced' && { completedAt: now }),
  //         });
  //       // Update all files in batch
  //       await attachmentDb.attachmentFiles
  //         .where('batchId')
  //         .equals(batchId)
  //         .modify({
  //           syncStatus,
  //           updatedAt: now,
  //           ...(errorMessage && { errorMessage }),
  //         });
  //     });
  //   } catch (error) {
  //     Sentry.captureException(error);
  //     console.error(`Failed to update batch sync status (${batchId}):`, error);
  //     throw error;
  //   }
  // }
  // /**
  //  * Update sync status for individual files
  //  */
  // async updateFileSyncStatus(fileIds: string[], syncStatus: SyncStatus, errorMessage?: string): Promise<void> {
  //   const now = new Date();
  //   try {
  //     await attachmentDb.attachmentFiles
  //       .where('fileId')
  //       .anyOf(fileIds)
  //       .modify((file) => {
  //         file.syncStatus = syncStatus;
  //         file.updatedAt = now;
  //         file.syncAttempts = (file.syncAttempts || 0) + 1;
  //         file.lastSyncAttempt = now;
  //         if (errorMessage) {
  //           file.errorMessage = errorMessage;
  //         }
  //       });
  //   } catch (error) {
  //     Sentry.captureException(error);
  //     console.error('Failed to update file sync status:', error);
  //     throw error;
  //   }
  // }
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
  // /**
  //  * Remove files by IDs
  //  */
  // async removeFiles(fileIds: string[]): Promise<void> {
  //   try {
  //     await attachmentDb.transaction('rw', attachmentDb.attachmentFiles, attachmentDb.attachmentBatches, async () => {
  //       // Get affected batches
  //       const files = await attachmentDb.attachmentFiles.where('fileId').anyOf(fileIds).toArray();
  //       const batchIdsSet = new Set(files.map((f) => f.batchId));
  //       const batchIds = Array.from(batchIdsSet);
  //       // Delete files
  //       await attachmentDb.attachmentFiles.where('fileId').anyOf(fileIds).delete();
  //       // Update batch file counts
  //       for (const batchId of batchIds) {
  //         const remainingCount = await attachmentDb.attachmentFiles.where('batchId').equals(batchId).count();
  //         if (remainingCount === 0) {
  //           // Delete empty batch
  //           await attachmentDb.attachmentBatches.where('batchId').equals(batchId).delete();
  //         } else {
  //           // Update batch file count
  //           await attachmentDb.attachmentBatches.where('batchId').equals(batchId).modify({
  //             fileCount: remainingCount,
  //             updatedAt: new Date(),
  //           });
  //         }
  //       }
  //     });
  //   } catch (error) {
  //     Sentry.captureException(error);
  //     console.error('Failed to remove files:', error);
  //     throw error;
  //   }
  // }
  // /**
  //  * Get batches needing sync (idle status)
  //  */
  // async getBatchesNeedingSync(organizationId: string): Promise<AttachmentBatch[]> {
  //   try {
  //     return await attachmentDb.attachmentBatches.where('[organizationId+syncStatus]').equals([organizationId, 'idle']).toArray();
  //   } catch (error) {
  //     Sentry.captureException(error);
  //     console.error('Failed to get batches needing sync:', error);
  //     return [];
  //   }
  // }
  // /**
  //  * Get live query for files by organization
  //  */
  // observeFilesByOrganization(organizationId: string): Subscription {
  //   return liveQuery(() => attachmentDb.attachmentFiles.where('organizationId').equals(organizationId).toArray()).subscribe({
  //     error: (error) => {
  //       Sentry.captureException(error);
  //       console.error('Live query error:', error);
  //     },
  //   });
  // }
  // /**
  //  * Get live query for files by sync status
  //  */
  // observeFilesBySyncStatus(organizationId: string, syncStatus: SyncStatus): Subscription {
  //   return liveQuery(() =>
  //     attachmentDb.attachmentFiles.where('[organizationId+syncStatus]').equals([organizationId, syncStatus]).toArray(),
  //   ).subscribe({
  //     error: (error) => {
  //       Sentry.captureException(error);
  //       console.error('Live query error:', error);
  //     },
  //   });
  // }
  /**
   * Store a cached image file with optimized performance
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

        const batchPromises = batch.map(async ({ id, name, contentType, originalKey: key, public: isPublic }) => {
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

            return { id, file };
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

  // /**
  //  * Get a cached image file
  //  */
  // async getCachedImage(id: string): Promise<File | undefined> {
  //   try {
  //     const result = await attachmentDb.attachmentCache.where('id').equals(id).first();
  //     return result?.file;
  //   } catch (error) {
  //     Sentry.captureException(error);
  //     console.error(`Failed to retrieve cached image (${id}):`, error);
  //     return undefined;
  //   }
  // }

  // /**
  //  * Delete a cached image file
  //  */
  // async deleteCachedImage(id: string): Promise<void> {
  //   try {
  //     await attachmentDb.attachmentCache.where('id').equals(id).delete();
  //   } catch (error) {
  //     Sentry.captureException(error);
  //     console.error(`Failed to delete cached image (${id}):`, error);
  //     throw error;
  //   }
  // }

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

export const dexieAttachmentStorage = new DexieAttachmentStorage();
