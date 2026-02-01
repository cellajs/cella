/**
 * Upload Sync Worker
 *
 * Background worker that syncs pending local uploads to cloud storage.
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

class UploadSyncWorker {
  private processing = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onlineHandler: (() => void) | null = null;

  /**
   * Start the sync worker.
   * Listens for online events and polls periodically.
   */
  start(): void {
    this.onlineHandler = () => this.attemptSync();
    window.addEventListener('online', this.onlineHandler);

    // Poll every 60 seconds
    this.intervalId = setInterval(() => this.attemptSync(), 60000);

    // Initial sync attempt
    this.attemptSync();

    console.debug('[UploadSyncWorker] Started');
  }

  /**
   * Stop the sync worker.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler);
      this.onlineHandler = null;
    }
    console.debug('[UploadSyncWorker] Stopped');
  }

  /**
   * Attempt to sync all pending uploads.
   */
  async attemptSync(): Promise<void> {
    // Skip if already processing or offline
    if (this.processing) return;
    if (!onlineManager.isOnline()) return;

    this.processing = true;

    try {
      // Get all pending uploads across all organizations
      const pending = await attachmentsDb.blobs.where('syncStatus').equals('pending').toArray();

      if (pending.length === 0) return;

      console.debug(`[UploadSyncWorker] Found ${pending.length} pending uploads`);

      // Group by organization for batch processing
      const byOrg = new Map<string, AttachmentBlob[]>();
      for (const blob of pending) {
        const existing = byOrg.get(blob.organizationId) || [];
        existing.push(blob);
        byOrg.set(blob.organizationId, existing);
      }

      // Process each organization's blobs
      for (const [organizationId, blobs] of byOrg) {
        await this.syncOrganizationUploads(organizationId, blobs);
      }
    } catch (error) {
      console.error('[UploadSyncWorker] Sync failed:', error);
    } finally {
      this.processing = false;
    }
  }

  /**
   * Check if cloud upload is available for an organization.
   * Returns true if Transloadit is configured.
   */
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

  /**
   * Sync uploads for a specific organization.
   * Each blob gets a fresh token via lazy assemblyOptions.
   */
  private async syncOrganizationUploads(organizationId: string, blobs: AttachmentBlob[]): Promise<void> {
    // Quick check if cloud is available at all
    const cloudAvailable = await this.checkCloudAvailability(organizationId);

    if (!cloudAvailable) {
      console.debug(`[UploadSyncWorker] No cloud available for org ${organizationId}, marking as local-only`);
      for (const blob of blobs) {
        await attachmentStorage.updateSyncStatus(blob.id, 'local-only');
      }
      return;
    }

    console.debug(`[UploadSyncWorker] Syncing ${blobs.length} blobs for org ${organizationId}`);

    // Process blobs individually with lazy token fetching
    for (const blob of blobs) {
      await this.syncSingleBlob(blob);
    }
  }

  /**
   * Sync a single blob using headless Uppy with lazy token fetching.
   * Token is fetched fresh per upload via assemblyOptions callback.
   */
  private async syncSingleBlob(blob: AttachmentBlob): Promise<void> {
    // Mark as syncing
    await attachmentStorage.updateSyncStatus(blob.id, 'syncing');

    // Create headless Uppy instance for this upload
    const uppy = new Uppy({
      autoProceed: false,
      allowMultipleUploadBatches: false,
    });

    try {
      // Configure Transloadit plugin with lazy token fetching
      uppy.use(Transloadit, {
        waitForEncoding: true,
        alwaysRunAssembly: true,
        // Lazy token: fetched fresh for each assembly (never expires mid-upload)
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

      // Add the blob as a file
      uppy.addFile({
        name: blob.filename || `${blob.id}.bin`,
        type: blob.contentType,
        data: blob.blob,
        meta: { attachmentId: blob.id },
      });

      // Start upload and wait for completion
      const result = await uppy.upload();

      if (!result) {
        await attachmentStorage.markFailed(blob.id, 'Upload returned no result');
        return;
      }

      if (result.successful && result.successful.length > 0) {
        // Upload succeeded - mark as synced
        await attachmentStorage.markSynced(blob.id);
        console.debug(`[UploadSyncWorker] Blob ${blob.id} synced successfully`);
      } else if (result.failed && result.failed.length > 0) {
        // Upload failed - error is a string in Uppy
        const file = result.failed[0];
        const errorMsg = typeof file.error === 'string' ? file.error : 'Upload failed';
        await attachmentStorage.markFailed(blob.id, errorMsg);
        console.warn(`[UploadSyncWorker] Blob ${blob.id} failed:`, errorMsg);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await attachmentStorage.markFailed(blob.id, errorMsg);
      console.error(`[UploadSyncWorker] Blob ${blob.id} error:`, error);
    } finally {
      // Clean up Uppy instance
      uppy.destroy();
    }
  }

  /**
   * Get sync status summary.
   */
  async getStatus(): Promise<{
    pending: number;
    syncing: number;
    failed: number;
    localOnly: number;
  }> {
    const [pending, syncing, failed, localOnly] = await Promise.all([
      attachmentsDb.blobs.where('syncStatus').equals('pending').count(),
      attachmentsDb.blobs.where('syncStatus').equals('syncing').count(),
      attachmentsDb.blobs.where('syncStatus').equals('failed').count(),
      attachmentsDb.blobs.where('syncStatus').equals('local-only').count(),
    ]);

    return { pending, syncing, failed, localOnly };
  }
}

export const uploadSyncWorker = new UploadSyncWorker();
