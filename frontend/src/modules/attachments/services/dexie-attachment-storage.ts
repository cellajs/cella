import * as Sentry from '@sentry/react';
import { liveQuery } from 'dexie';
import type { Subscription } from 'dexie';
import { nanoid } from '~/utils/nanoid';
import { attachmentDb, type AttachmentBatch, type AttachmentFile, type SyncStatus } from '../db/attachment-db';
import type { CustomUppyFile } from '~/modules/common/uploader/types';
import type { UploadTokenQuery } from '~/modules/me/types';

/**
 * Dexie-based attachment storage service with enhanced offline capabilities
 */
export class DexieAttachmentStorage {
  /**
   * Add files to a batch for offline storage
   */
  async addFiles(files: Record<string, CustomUppyFile>, tokenQuery: UploadTokenQuery): Promise<string> {
    if (!tokenQuery.organizationId) throw new Error('No organizationId provided');

    const batchId = nanoid(8);
    const now = new Date();
    const organizationId = tokenQuery.organizationId;

    try {
      await attachmentDb.transaction('rw', attachmentDb.attachmentBatches, attachmentDb.attachmentFiles, async () => {
        // Create batch record
        await attachmentDb.attachmentBatches.add({
          batchId,
          organizationId,
          tokenQuery,
          syncStatus: 'idle',
          fileCount: Object.keys(files).length,
          createdAt: now,
          updatedAt: now,
        });

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
      });

      return batchId;
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to save files:', error);
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

  /**
   * Get files by sync status for an organization
   */
  async getFilesBySyncStatus(organizationId: string, syncStatus: SyncStatus): Promise<AttachmentFile[]> {
    try {
      return await attachmentDb.attachmentFiles.where('[organizationId+syncStatus]').equals([organizationId, syncStatus]).toArray();
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to retrieve files by sync status:', error);
      return [];
    }
  }

  /**
   * Get a specific file by ID
   */
  async getFile(fileId: string): Promise<AttachmentFile | undefined> {
    try {
      return await attachmentDb.attachmentFiles.where('fileId').equals(fileId).first();
    } catch (error) {
      Sentry.captureException(error);
      console.error(`Failed to retrieve file (${fileId}):`, error);
      return undefined;
    }
  }

  /**
   * Get batch information
   */
  async getBatch(batchId: string): Promise<AttachmentBatch | undefined> {
    try {
      return await attachmentDb.attachmentBatches.where('batchId').equals(batchId).first();
    } catch (error) {
      Sentry.captureException(error);
      console.error(`Failed to retrieve batch (${batchId}):`, error);
      return undefined;
    }
  }

  /**
   * Get all files in a batch
   */
  async getBatchFiles(batchId: string): Promise<AttachmentFile[]> {
    try {
      return await attachmentDb.attachmentFiles.where('batchId').equals(batchId).toArray();
    } catch (error) {
      Sentry.captureException(error);
      console.error(`Failed to retrieve batch files (${batchId}):`, error);
      return [];
    }
  }

  /**
   * Update sync status for a batch
   */
  async updateBatchSyncStatus(batchId: string, syncStatus: SyncStatus, errorMessage?: string): Promise<void> {
    const now = new Date();

    try {
      await attachmentDb.transaction('rw', attachmentDb.attachmentBatches, attachmentDb.attachmentFiles, async () => {
        // Update batch
        await attachmentDb.attachmentBatches
          .where('batchId')
          .equals(batchId)
          .modify({
            syncStatus,
            updatedAt: now,
            ...(syncStatus === 'synced' && { completedAt: now }),
          });

        // Update all files in batch
        await attachmentDb.attachmentFiles
          .where('batchId')
          .equals(batchId)
          .modify({
            syncStatus,
            updatedAt: now,
            ...(errorMessage && { errorMessage }),
          });
      });
    } catch (error) {
      Sentry.captureException(error);
      console.error(`Failed to update batch sync status (${batchId}):`, error);
      throw error;
    }
  }

  /**
   * Update sync status for individual files
   */
  async updateFileSyncStatus(fileIds: string[], syncStatus: SyncStatus, errorMessage?: string): Promise<void> {
    const now = new Date();

    try {
      await attachmentDb.attachmentFiles
        .where('fileId')
        .anyOf(fileIds)
        .modify((file) => {
          file.syncStatus = syncStatus;
          file.updatedAt = now;
          file.syncAttempts = (file.syncAttempts || 0) + 1;
          file.lastSyncAttempt = now;
          if (errorMessage) {
            file.errorMessage = errorMessage;
          }
        });
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to update file sync status:', error);
      throw error;
    }
  }

  /**
   * Update file name
   */
  async updateFileName(fileId: string, newName: string): Promise<AttachmentFile | undefined> {
    try {
      await attachmentDb.attachmentFiles
        .where('fileId')
        .equals(fileId)
        .modify((file) => {
          file.file.name = newName;
          file.updatedAt = new Date();
        });

      return await this.getFile(fileId);
    } catch (error) {
      Sentry.captureException(error);
      console.error(`Failed to update file name (${fileId}):`, error);
      return undefined;
    }
  }

  /**
   * Remove files by IDs
   */
  async removeFiles(fileIds: string[]): Promise<void> {
    try {
      await attachmentDb.transaction('rw', attachmentDb.attachmentFiles, attachmentDb.attachmentBatches, async () => {
        // Get affected batches
        const files = await attachmentDb.attachmentFiles.where('fileId').anyOf(fileIds).toArray();

        const batchIdsSet = new Set(files.map((f) => f.batchId));
        const batchIds = Array.from(batchIdsSet);

        // Delete files
        await attachmentDb.attachmentFiles.where('fileId').anyOf(fileIds).delete();

        // Update batch file counts
        for (const batchId of batchIds) {
          const remainingCount = await attachmentDb.attachmentFiles.where('batchId').equals(batchId).count();

          if (remainingCount === 0) {
            // Delete empty batch
            await attachmentDb.attachmentBatches.where('batchId').equals(batchId).delete();
          } else {
            // Update batch file count
            await attachmentDb.attachmentBatches.where('batchId').equals(batchId).modify({
              fileCount: remainingCount,
              updatedAt: new Date(),
            });
          }
        }
      });
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to remove files:', error);
      throw error;
    }
  }

  /**
   * Get batches needing sync (idle status)
   */
  async getBatchesNeedingSync(organizationId: string): Promise<AttachmentBatch[]> {
    try {
      return await attachmentDb.attachmentBatches.where('[organizationId+syncStatus]').equals([organizationId, 'idle']).toArray();
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to get batches needing sync:', error);
      return [];
    }
  }

  /**
   * Get live query for files by organization
   */
  observeFilesByOrganization(organizationId: string): Subscription {
    return liveQuery(() => attachmentDb.attachmentFiles.where('organizationId').equals(organizationId).toArray()).subscribe({
      error: (error) => {
        Sentry.captureException(error);
        console.error('Live query error:', error);
      },
    });
  }

  /**
   * Get live query for files by sync status
   */
  observeFilesBySyncStatus(organizationId: string, syncStatus: SyncStatus): Subscription {
    return liveQuery(() =>
      attachmentDb.attachmentFiles.where('[organizationId+syncStatus]').equals([organizationId, syncStatus]).toArray(),
    ).subscribe({
      error: (error) => {
        Sentry.captureException(error);
        console.error('Live query error:', error);
      },
    });
  }

  /**
   * Clear all data for an organization
   */
  async clearOrganizationData(organizationId: string): Promise<void> {
    try {
      await attachmentDb.transaction('rw', attachmentDb.attachmentFiles, attachmentDb.attachmentBatches, async () => {
        await attachmentDb.attachmentFiles.where('organizationId').equals(organizationId).delete();

        await attachmentDb.attachmentBatches.where('organizationId').equals(organizationId).delete();
      });
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to clear organization data:', error);
      throw error;
    }
  }
}

export const dexieAttachmentStorage = new DexieAttachmentStorage();
