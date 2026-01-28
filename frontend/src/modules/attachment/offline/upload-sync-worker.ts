/**
 * Upload Sync Worker
 *
 * Background worker that syncs pending local uploads to cloud storage.
 * Runs periodically and when coming back online.
 *
 * This is a simplified implementation that marks blobs for re-upload.
 * Full Transloadit re-upload would require recreating the assembly.
 */
import { onlineManager } from '@tanstack/react-query';
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

      // Group by organization for efficient token requests
      const byOrg = new Map<string, AttachmentBlob[]>();
      for (const blob of pending) {
        const existing = byOrg.get(blob.organizationId) || [];
        existing.push(blob);
        byOrg.set(blob.organizationId, existing);
      }

      // Process each organization
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
   * Sync uploads for a specific organization.
   */
  private async syncOrganizationUploads(organizationId: string, blobs: AttachmentBlob[]): Promise<void> {
    try {
      // Check if cloud upload is available
      const token = await getUploadToken({
        query: {
          public: false,
          templateId: 'attachment',
          organizationId,
        },
      });

      // If no Transloadit configured, mark all as local-only
      if (!token?.params || !token?.signature) {
        console.debug(`[UploadSyncWorker] No cloud available for org ${organizationId}, marking as local-only`);
        for (const blob of blobs) {
          await attachmentStorage.updateSyncStatus(blob.id, 'local-only');
        }
        return;
      }

      // Cloud is available - for now just log
      // Full implementation would use Transloadit SDK to create assembly
      console.debug(`[UploadSyncWorker] Cloud available for org ${organizationId}, ${blobs.length} blobs to sync`);

      // TODO: Implement actual Transloadit upload
      // This requires:
      // 1. Creating a new Transloadit assembly
      // 2. Uploading each blob
      // 3. Waiting for encoding
      // 4. Updating the attachment record with new URLs
      // 5. Marking blob as synced

      // For now, mark as syncing to indicate cloud is available
      // The user can manually re-upload or we implement full sync later
      for (const blob of blobs) {
        // For MVP: Just mark that sync is possible
        // In production: Actually upload to Transloadit
        console.debug(`[UploadSyncWorker] Blob ${blob.id} ready for sync (implementation pending)`);
      }
    } catch (error) {
      console.error(`[UploadSyncWorker] Failed to sync org ${organizationId}:`, error);
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
