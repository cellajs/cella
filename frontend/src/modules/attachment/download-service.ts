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
 * - Uses findAttachmentInCache to lookup attachment metadata from react-query cache
 * - Blobs are stored in IndexedDB for offline access
 */

import { onlineManager } from '@tanstack/react-query';
import { liveQuery, type Subscription } from 'dexie';
import type { Attachment } from 'sdk';
import { appConfig } from 'shared';
import { attachmentsDb, type BlobVariant } from '~/modules/attachment/dexie/attachments-db';
import { downloadQueue } from '~/modules/attachment/dexie/download-queue';
import { attachmentStorage } from '~/modules/attachment/dexie/storage-service';
import { getFileUrl } from '~/modules/attachment/file-url';
import { findAttachmentInCache } from '~/modules/attachment/query';
import { isPersisted } from '~/modules/attachment/types';
import { flattenInfiniteData } from '~/query/basic/flatten';
import { queryClient } from '~/query/query-client';

/** Variant download priority - download in this order */
const variantPriority: BlobVariant[] = ['thumbnail', 'converted', 'original'];

/** Per-fetch timeout for variant downloads. */
const variantFetchTimeoutMs = 30_000;

/** Result of attempting to download a single variant. */
type VariantResult = 'stored' | 'skipped' | 'failed-auth' | 'failed-other';

class AttachmentDownloadService {
  private processing = false;
  private wakeScheduled = false;
  private queueSubscription: Subscription | null = null;
  private onlineUnsubscribe: (() => void) | null = null;
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

    // Wake up when connectivity returns.
    this.onlineUnsubscribe = onlineManager.subscribe((online) => {
      if (online) this.processQueueSoon();
    });

    // Drive processing reactively from the queue itself: any time there are pending
    // rows, schedule a run. Replaces the previous setInterval polling.
    // Note: uses a table-scan `.filter` rather than `.where('status')` because `status`
    // is only part of a compound index (`[organizationId+status]`) in the schema —
    // the queue is small so a scan is cheap and avoids a schema migration.
    this.queueSubscription = liveQuery(() =>
      attachmentsDb.downloadQueue.filter((e) => e.status === 'pending').count(),
    ).subscribe({
      next: (count) => {
        if (count > 0) this.processQueueSoon();
      },
      error: (err) => console.error('[DownloadService] Queue liveQuery error:', err),
    });

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

    console.debug('[DownloadService] Started');
  }

  /**
   * Stop the download service.
   */
  stop(): void {
    if (this.queueSubscription) {
      this.queueSubscription.unsubscribe();
      this.queueSubscription = null;
    }
    if (this.onlineUnsubscribe) {
      this.onlineUnsubscribe();
      this.onlineUnsubscribe = null;
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
   * Schedule a queue run on the next microtask, deduped by `wakeScheduled`.
   * Cheap to call from many places; processQueue itself guards against re-entry.
   */
  private processQueueSoon(): void {
    if (this.wakeScheduled) return;
    this.wakeScheduled = true;
    queueMicrotask(() => {
      this.wakeScheduled = false;
      this.processQueue();
    });
  }

  /**
   * Queue attachments for download.
   * Call this when attachments are loaded from react-query.
   */
  async queueForDownload(attachments: Attachment[]): Promise<void> {
    if (!this.config?.enabled) return;
    if (!attachments.length) return;

    // Skip transient optimistic rows; queue only persisted attachments.
    const queueable = attachments.filter(isPersisted);
    if (!queueable.length) return;

    // Get organization ID from first attachment
    const organizationId = queueable[0]?.organizationId;
    if (!organizationId) return;

    await downloadQueue.enqueue(queueable, organizationId);

    // The queue liveQuery will pick up the new pending rows and wake processing,
    // but call directly too in case enqueue produced no new rows (e.g. all already cached).
    if (onlineManager.isOnline()) {
      this.processQueueSoon();
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
      const concurrency = this.config.downloadConcurrency ?? 2;

      // Get all pending downloads (table scan is fine — small table)
      const pendingAll = await attachmentsDb.downloadQueue.filter((e) => e.status === 'pending').toArray();

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
   * Downloads variants in priority order: thumbnail → converted → original.
   * Evicts raw blob after original is downloaded.
   */
  private async downloadAttachment(attachmentId: string, organizationId: string): Promise<void> {
    // Lookup attachment in react-query cache *before* claiming the row, so we don't
    // burn an attempt on rows whose metadata hasn't synced yet. The liveQuery will
    // re-trigger us once the cache fills.
    const attachment = findAttachmentInCache(attachmentId);
    if (!attachment) {
      console.debug(`[DownloadService] Attachment ${attachmentId} not in cache yet, leaving pending`);
      return;
    }

    if (!attachment.originalKey) {
      await downloadQueue.transition(attachmentId, 'skipped', 'No originalKey');
      return;
    }

    if (!attachment.tenantId || !attachment.organizationId) {
      await downloadQueue.transition(attachmentId, 'skipped', 'Missing tenantId or organizationId');
      return;
    }

    // Claim the row.
    await downloadQueue.transition(attachmentId, 'downloading');

    try {
      let downloadedAny = false;
      let downloadedOriginal = false;
      let authFailed = false;

      for (const variant of variantPriority) {
        const result = await this.downloadVariant(attachment, variant, organizationId);

        if (result === 'stored') {
          downloadedAny = true;
          if (variant === 'original') downloadedOriginal = true;
        } else if (result === 'failed-auth') {
          // Auth/permission failures will repeat for every variant — bail out.
          authFailed = true;
          break;
        }
        // 'skipped' and 'failed-other' just continue to the next variant.
      }

      // Evict raw blob after original is downloaded (smart eviction)
      if (downloadedOriginal) {
        await attachmentStorage.evictRawBlob(attachmentId);
      }

      if (downloadedAny) {
        await downloadQueue.transition(attachmentId, 'downloaded');
        console.debug(`[DownloadService] Completed downloading attachment ${attachmentId}`);
      } else {
        await downloadQueue.transition(attachmentId, 'failed');
        console.debug(
          `[DownloadService] No variants downloaded for ${attachmentId}, marked as failed${authFailed ? ' (auth)' : ''}`,
        );
      }
    } catch (error) {
      console.error(`[DownloadService] Failed to download ${attachmentId}:`, error);
      await downloadQueue.transition(attachmentId, 'failed');
    }
  }

  /**
   * Download and store a single variant. Returns the outcome so the caller can
   * decide how to aggregate results across variants.
   */
  private async downloadVariant(
    attachment: Attachment,
    variant: BlobVariant,
    organizationId: string,
  ): Promise<VariantResult> {
    const key = this.getVariantKey(attachment, variant);
    if (!key) return 'skipped';

    // Already have it locally — nothing to do.
    if (await attachmentStorage.hasVariant(attachment.id, variant)) return 'skipped';

    // Guarded above in downloadAttachment, but keep narrow types happy.
    if (!attachment.tenantId || !attachment.organizationId) return 'failed-other';

    try {
      const url = await getFileUrl(key, attachment.public, attachment.tenantId, attachment.organizationId);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), variantFetchTimeoutMs);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.status === 401 || response.status === 403) {
        console.debug(`[DownloadService] Auth failure (${response.status}) for ${attachment.id}/${variant}`);
        return 'failed-auth';
      }

      if (!response.ok) {
        console.debug(`[DownloadService] HTTP ${response.status} for ${attachment.id}/${variant}`);
        return 'failed-other';
      }

      const blob = await response.blob();
      const contentType =
        variant === 'converted' && attachment.convertedContentType
          ? attachment.convertedContentType
          : attachment.contentType || blob.type;

      await attachmentStorage.storeDownloadBlobWithVariant(attachment.id, variant, organizationId, blob, contentType);

      console.debug(`[DownloadService] Downloaded ${variant} for ${attachment.id}`);
      return 'stored';
    } catch (err) {
      console.debug(`[DownloadService] Error downloading ${variant} for ${attachment.id}:`, err);
      return 'failed-other';
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
}

export const downloadService = new AttachmentDownloadService();
