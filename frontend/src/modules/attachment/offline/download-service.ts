/**
 * Download Service
 *
 * Background service that downloads attachments from cloud for offline viewing.
 * Uses the download queue in Dexie and respects config filters (size, content type).
 *
 * Integration with react-query:
 * - Attachments are fetched via normal queries
 * - This service queues them for blob download in background
 * - Blobs are stored in IndexedDB for offline access
 */
import { onlineManager } from '@tanstack/react-query';
import { appConfig } from 'config';
import type { Attachment } from '~/api.gen';
import { getPresignedUrl } from '~/api.gen/sdk.gen';
import { attachmentsDb } from '~/modules/attachment/dexie/attachments-db';
import { attachmentStorage } from '~/modules/attachment/dexie/storage-service';

class AttachmentDownloadService {
  private processing = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onlineHandler: (() => void) | null = null;

  /**
   * Get config for local blob storage.
   */
  private get config() {
    return appConfig.localBlobStorage;
  }

  /**
   * Start the download service.
   */
  start(): void {
    if (!this.config?.enabled) {
      console.debug('[DownloadService] Local blob storage disabled');
      return;
    }

    this.onlineHandler = () => this.processQueue();
    window.addEventListener('online', this.onlineHandler);

    // Process queue every 30 seconds
    this.intervalId = setInterval(() => this.processQueue(), 30000);

    console.debug('[DownloadService] Started');
  }

  /**
   * Stop the download service.
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
    console.debug('[DownloadService] Stopped');
  }

  /**
   * Queue attachments for download.
   * Call this when attachments are loaded from react-query.
   */
  async queueForDownload(attachments: Attachment[]): Promise<void> {
    if (!this.config?.enabled) return;
    if (!attachments.length) return;

    // Get organization ID from first attachment
    const organizationId = attachments[0]?.organizationId;
    if (!organizationId) return;

    await attachmentStorage.queueForDownload(attachments, organizationId);

    // Trigger processing if online
    if (onlineManager.isOnline()) {
      this.processQueue();
    }
  }

  /**
   * Process the download queue.
   */
  async processQueue(): Promise<void> {
    if (!this.config?.enabled) return;
    if (this.processing) return;
    if (!onlineManager.isOnline()) return;

    this.processing = true;

    try {
      // Get pending downloads with concurrency limit
      const concurrency = this.config.downloadConcurrency ?? 2;

      // Get all organizations with pending downloads
      const pendingAll = await attachmentsDb.downloadQueue.where('status').equals('pending').toArray();

      if (pendingAll.length === 0) return;

      // Group by organization
      const byOrg = new Map<string, typeof pendingAll>();
      for (const entry of pendingAll) {
        const existing = byOrg.get(entry.organizationId) || [];
        existing.push(entry);
        byOrg.set(entry.organizationId, existing);
      }

      // Process each organization
      for (const [organizationId, entries] of byOrg) {
        // Check storage limit
        const used = await attachmentStorage.getStorageUsed(organizationId);
        const maxTotal = this.config.maxTotalSize ?? 100 * 1024 * 1024;

        if (used >= maxTotal) {
          console.debug(`[DownloadService] Storage limit reached for org ${organizationId}`);
          continue;
        }

        // Sort by priority and take up to concurrency limit
        const sorted = entries.sort((a, b) => a.priority - b.priority).slice(0, concurrency);

        // Download in parallel
        await Promise.all(sorted.map((entry) => this.downloadAttachment(entry.id, organizationId)));
      }
    } catch (error) {
      console.error('[DownloadService] Queue processing failed:', error);
    } finally {
      this.processing = false;
    }
  }

  /**
   * Download a single attachment.
   */
  private async downloadAttachment(attachmentId: string, _organizationId: string): Promise<void> {
    try {
      // Mark as downloading
      await attachmentStorage.updateDownloadStatus(attachmentId, 'downloading');

      // Get attachment metadata from queue (we need the key to fetch)
      // Note: The queue entry doesn't have the key, so we need to get it from somewhere
      // For now, we'll need to query the attachment data

      // This is a limitation: we need the attachment's originalKey to download
      // The queue only stores the ID. We should either:
      // 1. Store more metadata in the queue
      // 2. Look up from react-query cache
      // 3. Make an API call to get attachment details

      // For MVP: Mark as skipped if we can't get the URL
      // In production: Would integrate with react-query cache
      console.debug(`[DownloadService] Would download attachment ${attachmentId} (implementation pending)`);
      await attachmentStorage.updateDownloadStatus(attachmentId, 'skipped', 'Download implementation pending');
    } catch (error) {
      console.error(`[DownloadService] Failed to download ${attachmentId}:`, error);
      await attachmentStorage.updateDownloadStatus(attachmentId, 'failed');
    }
  }

  /**
   * Download an attachment immediately (not queued).
   * Use this when you have the full attachment data.
   */
  async downloadNow(attachment: Attachment): Promise<boolean> {
    if (!this.config?.enabled) return false;
    if (!onlineManager.isOnline()) return false;

    try {
      // Check if already cached
      const exists = await attachmentStorage.hasBlob(attachment.id);
      if (exists) return true;

      // Get presigned URL
      const url = await getPresignedUrl({
        query: {
          key: attachment.originalKey,
          isPublic: attachment.public,
        },
      });

      // Download with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();

      // Store in IndexedDB
      await attachmentStorage.storeDownloadBlob(
        attachment.id,
        attachment.organizationId,
        blob,
        attachment.contentType || blob.type,
      );

      console.debug(`[DownloadService] Downloaded attachment ${attachment.id}`);
      return true;
    } catch (error) {
      console.error(`[DownloadService] Failed to download ${attachment.id}:`, error);
      return false;
    }
  }

  /**
   * Get download statistics.
   */
  async getStats(organizationId?: string): Promise<{
    pending: number;
    downloading: number;
    completed: number;
    failed: number;
    skipped: number;
    storageUsed: number;
  }> {
    const baseQuery = organizationId
      ? attachmentsDb.downloadQueue.where('organizationId').equals(organizationId)
      : attachmentsDb.downloadQueue;

    const allEntries = await baseQuery.toArray();

    const stats = {
      pending: 0,
      downloading: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
    };

    for (const entry of allEntries) {
      switch (entry.status) {
        case 'pending':
          stats.pending++;
          break;
        case 'downloading':
          stats.downloading++;
          break;
        case 'completed':
          stats.completed++;
          break;
        case 'failed':
          stats.failed++;
          break;
        case 'skipped':
          stats.skipped++;
          break;
      }
    }

    const storageUsed = organizationId ? await attachmentStorage.getStorageUsed(organizationId) : 0;

    return { ...stats, storageUsed };
  }
}

export const downloadService = new AttachmentDownloadService();
