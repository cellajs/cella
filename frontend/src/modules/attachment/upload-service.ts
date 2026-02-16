/**
 * Upload Service
 *
 * Background service that syncs pending local uploads to cloud storage.
 * Runs periodically and when coming back online.
 *
 * Uses headless Uppy with @uppy/transloadit for reliable uploads with:
 * - Tus resumable upload protocol
 * - Built-in exponential backoff for rate limiting
 * - Lazy token fetching per upload (never expires mid-upload)
 * - Assembly completion waiting with internal polling
 */
import { onlineManager } from '@tanstack/react-query';
import { Uppy } from '@uppy/core';
import Transloadit from '@uppy/transloadit';
import { getUploadToken } from '~/api.gen';
import { type AttachmentBlob, attachmentsDb } from '~/modules/attachment/dexie/attachments-db';
import { attachmentStorage } from '~/modules/attachment/dexie/storage-service';

class AttachmentUploadService {
  private processing = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onlineHandler: (() => void) | null = null;

  /** Start the upload service. Listens for online events and polls periodically. */
  start(): void {
    this.onlineHandler = () => this.attemptSync();
    window.addEventListener('online', this.onlineHandler);

    // Poll every 60 seconds
    this.intervalId = setInterval(() => this.attemptSync(), 60000);

    // Initial sync attempt
    this.attemptSync();
  }

  /** Stop the upload service. */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler);
      this.onlineHandler = null;
    }
  }

  /** Attempt to sync all pending uploads. */
  async attemptSync(): Promise<void> {
    if (this.processing) return;
    if (!onlineManager.isOnline()) return;

    this.processing = true;

    try {
      const pending = await attachmentsDb.blobs.where('uploadStatus').equals('pending').toArray();
      if (pending.length === 0) return;

      // Group by organization for batch processing
      const byOrg = new Map<string, AttachmentBlob[]>();
      for (const blob of pending) {
        const existing = byOrg.get(blob.organizationId) || [];
        existing.push(blob);
        byOrg.set(blob.organizationId, existing);
      }

      for (const [organizationId, blobs] of byOrg) {
        await this.syncOrganizationUploads(organizationId, blobs);
      }
    } catch (error) {
      console.error('[UploadService] Sync failed:', error);
    } finally {
      this.processing = false;
    }
  }

  /** Check if cloud upload is available for an organization. */
  private async checkCloudAvailability(organizationId: string): Promise<boolean> {
    try {
      const token = await getUploadToken({
        query: { public: false, templateId: 'attachment', organizationId },
      });
      return !!(token?.params && token?.signature);
    } catch {
      return false;
    }
  }

  /** Sync uploads for a specific organization. Each blob gets a fresh token via lazy assemblyOptions. */
  private async syncOrganizationUploads(organizationId: string, blobs: AttachmentBlob[]): Promise<void> {
    const cloudAvailable = await this.checkCloudAvailability(organizationId);

    if (!cloudAvailable) {
      for (const blob of blobs) {
        await attachmentStorage.updateUploadStatus(blob.id, 'local-only');
      }
      return;
    }

    for (const blob of blobs) {
      try {
        await this.syncSingleBlob(blob);
      } catch (error) {
        console.error(`[UploadService] Failed to sync blob ${blob.id}:`, error);
        await attachmentStorage.updateUploadStatus(blob.id, 'failed');
      }
    }
  }

  /** Sync a single blob using headless Uppy with lazy token fetching. */
  private async syncSingleBlob(blob: AttachmentBlob): Promise<void> {
    await attachmentStorage.updateUploadStatus(blob.id, 'uploading');

    const uppy = new Uppy({
      autoProceed: false,
      allowMultipleUploadBatches: false,
    });

    try {
      uppy.use(Transloadit, {
        waitForEncoding: true,
        alwaysRunAssembly: true,
        assemblyOptions: async () => {
          const token = await getUploadToken({
            query: {
              public: blob.uploadContext?.public ?? false,
              templateId: blob.uploadContext?.templateId ?? 'attachment',
              organizationId: blob.organizationId,
            },
          });

          if (!token?.params || !token?.signature) {
            throw new Error('Failed to get upload token');
          }

          return { params: token.params, signature: token.signature };
        },
      });

      uppy.addFile({
        name: blob.filename || `${blob.id}.bin`,
        type: blob.contentType,
        data: blob.blob,
        meta: { attachmentId: blob.id },
      });

      const result = await uppy.upload();

      if (!result) {
        await attachmentStorage.markFailed(blob.id, 'Upload returned no result');
        return;
      }

      if (result.successful && result.successful.length > 0) {
        await attachmentStorage.markUploaded(blob.id);
      } else if (result.failed && result.failed.length > 0) {
        const file = result.failed[0];
        const errorMsg = typeof file.error === 'string' ? file.error : 'Upload failed';
        await attachmentStorage.markFailed(blob.id, errorMsg);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await attachmentStorage.markFailed(blob.id, errorMsg);
      console.error(`[UploadService] Blob ${blob.id} error:`, error);
    } finally {
      uppy.destroy();
    }
  }

  /** Get sync status summary. */
  async getStatus(): Promise<{
    pending: number;
    uploading: number;
    failed: number;
    localOnly: number;
  }> {
    const [pending, uploading, failed, localOnly] = await Promise.all([
      attachmentsDb.blobs.where('uploadStatus').equals('pending').count(),
      attachmentsDb.blobs.where('uploadStatus').equals('uploading').count(),
      attachmentsDb.blobs.where('uploadStatus').equals('failed').count(),
      attachmentsDb.blobs.where('uploadStatus').equals('local-only').count(),
    ]);

    return { pending, uploading, failed, localOnly };
  }
}

export const uploadService = new AttachmentUploadService();
