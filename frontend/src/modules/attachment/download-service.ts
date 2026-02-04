/**
 * Download Service
 *
 * Background service that downloads attachments from cloud for offline viewing.
 * Uses the download queue in Dexie and respects config filters (size, content type).
 *
 * Variant download priority: thumbnail → converted → original
 * After downloading 'original', evicts 'raw' blob if present.
 *
 * Integration with react-query:
 * - Attachments are fetched via normal queries and cached
 * - This service queues them for blob download in background
 * - Uses findInListCache to lookup attachment metadata from react-query cache
 * - Blobs are stored in IndexedDB for offline access
 */
import { onlineManager } from '@tanstack/react-query';
import { appConfig } from 'shared';
import type { Attachment } from '~/api.gen';
import { getPresignedUrl } from '~/api.gen/sdk.gen';
import { attachmentsDb, type BlobVariant } from '~/modules/attachment/dexie/attachments-db';
import { attachmentStorage } from '~/modules/attachment/dexie/storage-service';
import { attachmentQueryKeys } from '~/modules/attachment/query';
import { findInListCache } from '~/query/basic';
import { flattenInfiniteData } from '~/query/basic/flatten';
import { queryClient } from '~/query/query-client';

/** Variant download priority - download in this order */
const variantPriority: BlobVariant[] = ['thumbnail', 'converted', 'original'];

class AttachmentDownloadService {
  private processing = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onlineHandler: (() => void) | null = null;
  private cacheUnsubscribe: (() => void) | null = null;
  private mutationUnsubscribe: (() => void) | null = null;

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

    // Subscribe to query cache to detect new attachments
    this.cacheUnsubscribe = queryClient.getQueryCache().subscribe((event) => {
      // Only react to successful data updates for attachment list queries
      if (event.type !== 'updated') return;
      if (event.action.type !== 'success') return;

      const queryKey = event.query.queryKey;
      if (!Array.isArray(queryKey) || queryKey[0] !== 'attachment' || queryKey[1] !== 'list') return;

      // Extract attachments from the query data
      const attachments = flattenInfiniteData<Attachment>(event.query.state.data);
      if (attachments.length > 0) {
        this.queueForDownload(attachments);
      }
    });

    // Subscribe to mutation cache to clean up blobs when attachments are deleted
    this.mutationUnsubscribe = queryClient.getMutationCache().subscribe((event) => {
      // Only react to successful mutations
      if (event.type !== 'updated') return;
      if (event.mutation.state.status !== 'success') return;

      const mutationKey = event.mutation.options.mutationKey;
      if (!Array.isArray(mutationKey) || mutationKey[0] !== 'attachment' || mutationKey[1] !== 'delete') return;

      // Get the deleted attachments from mutation variables
      const deletedAttachments = event.mutation.state.variables as Attachment[] | undefined;
      if (!deletedAttachments?.length) return;

      // Remove blobs from local storage
      const ids = deletedAttachments.map((a) => a.id);
      attachmentStorage.deleteBlobs(ids).catch((err) => {
        console.error('[DownloadService] Failed to delete local blobs:', err);
      });
    });

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
    if (this.cacheUnsubscribe) {
      this.cacheUnsubscribe();
      this.cacheUnsubscribe = null;
    }
    if (this.mutationUnsubscribe) {
      this.mutationUnsubscribe();
      this.mutationUnsubscribe = null;
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
   * Download a single attachment by looking up metadata from react-query cache.
   */
  /**
   * Download a single attachment by looking up metadata from react-query cache.
   * Downloads variants in priority order: thumbnail → converted → original.
   * Evicts raw blob after original is downloaded.
   */
  private async downloadAttachment(attachmentId: string, organizationId: string): Promise<void> {
    try {
      // Mark as downloading
      await attachmentStorage.updateDownloadStatus(attachmentId, 'downloading');

      // Lookup attachment in react-query cache
      const attachment = findInListCache<Attachment>(attachmentQueryKeys.list.base, attachmentId);

      if (!attachment) {
        console.debug(`[DownloadService] Attachment ${attachmentId} not found in cache, will retry later`);
        // Leave in 'pending' state for retry - don't mark as skipped
        await attachmentStorage.updateDownloadStatus(attachmentId, 'pending', 'Waiting for cache');
        return;
      }

      if (!attachment.originalKey) {
        await attachmentStorage.updateDownloadStatus(attachmentId, 'skipped', 'No originalKey');
        return;
      }

      // Download variants in priority order
      let downloadedOriginal = false;

      for (const variant of variantPriority) {
        const key = this.getVariantKey(attachment, variant);
        if (!key) continue;

        // Check if already downloaded
        const existingVariant = await attachmentStorage.hasAnyVariant(attachmentId);
        if (existingVariant === variant) continue;

        try {
          const url = await getPresignedUrl({
            query: { key, isPublic: attachment.public },
          });

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);

          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);

          if (!response.ok) {
            console.debug(
              `[DownloadService] Failed to download ${variant} for ${attachmentId}: HTTP ${response.status}`,
            );
            continue;
          }

          const blob = await response.blob();
          const contentType =
            variant === 'converted' && attachment.convertedContentType
              ? attachment.convertedContentType
              : attachment.contentType || blob.type;

          await attachmentStorage.storeDownloadBlobWithVariant(
            attachmentId,
            variant,
            organizationId,
            blob,
            contentType,
          );

          console.debug(`[DownloadService] Downloaded ${variant} for ${attachmentId}`);

          if (variant === 'original') {
            downloadedOriginal = true;
          }
        } catch (err) {
          console.debug(`[DownloadService] Error downloading ${variant} for ${attachmentId}:`, err);
        }
      }

      // Evict raw blob after original is downloaded (smart eviction)
      if (downloadedOriginal) {
        await attachmentStorage.evictRawBlob(attachmentId);
      }

      // Mark as downloaded in queue
      await attachmentStorage.updateDownloadStatus(attachmentId, 'downloaded');
      console.debug(`[DownloadService] Completed downloading attachment ${attachmentId}`);
    } catch (error) {
      console.error(`[DownloadService] Failed to download ${attachmentId}:`, error);
      await attachmentStorage.updateDownloadStatus(attachmentId, 'failed');
    }
  }

  /**
   * Get the cloud key for a specific variant.
   */
  private getVariantKey(attachment: Attachment, variant: BlobVariant): string | null {
    switch (variant) {
      case 'thumbnail':
        return attachment.thumbnailKey || null;
      case 'converted':
        return attachment.convertedKey || null;
      case 'original':
        return attachment.originalKey || null;
      default:
        return null;
    }
  }

  /**
   * Download an attachment immediately (not queued).
   * Downloads original variant and evicts raw if present.
   */
  async downloadNow(attachment: Attachment): Promise<boolean> {
    if (!this.config?.enabled) return false;
    if (!onlineManager.isOnline()) return false;

    try {
      // Check if original already cached
      const existingVariant = await attachmentStorage.hasAnyVariant(attachment.id);
      if (existingVariant === 'original') return true;

      // Get presigned URL for original
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

      // Store as original variant
      await attachmentStorage.storeDownloadBlobWithVariant(
        attachment.id,
        'original',
        attachment.organizationId,
        blob,
        attachment.contentType || blob.type,
      );

      // Evict raw blob if present
      await attachmentStorage.evictRawBlob(attachment.id);

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
    downloaded: number;
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
      downloaded: 0,
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
        case 'downloaded':
          stats.downloaded++;
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
