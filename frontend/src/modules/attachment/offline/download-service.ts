import { onlineManager } from '@tanstack/react-query';
import { liveQuery, type Subscription } from 'dexie';
import type { Attachment } from 'sdk';
import { appConfig } from 'shared';
import { type CloudFileVariant, getCloudUrl, getVariantKey } from '~/modules/attachment/file-url';
import { attachmentsDb } from '~/modules/attachment/offline/attachments-db';
import { downloadQueue, SKIP_REASON_NO_ORIGINAL_KEY } from '~/modules/attachment/offline/download-queue';
import { attachmentStorage } from '~/modules/attachment/offline/storage-service';
import { attachmentQueryKeys, findAttachmentInCache } from '~/modules/attachment/query';
import { isPersisted } from '~/modules/attachment/types';
import { getAppDb } from '~/query/app-db';
import { subscribeOwnerChange } from '~/query/app-storage';
import { flattenInfiniteData } from '~/query/basic/flatten';
import { queryClient } from '~/query/query-client';

/** Variant download priority, in download order. 'raw' is local-only, so never fetched. */
const variantPriority: CloudFileVariant[] = ['thumbnail', 'converted', 'original'];

/** Per-fetch timeout for variant downloads. */
const variantFetchTimeoutMs = 30_000;

/** Result of attempting to download a single variant. */
type VariantResult = 'stored' | 'skipped' | 'failed-auth' | 'failed-other';

/** True when `key` starts with every segment of `prefix` (react-query's own key-matching rule). */
function matchesKeyPrefix(key: unknown, prefix: readonly unknown[]): boolean {
  if (!Array.isArray(key)) return false;
  return prefix.every((segment, i) => key[i] === segment);
}

class AttachmentDownloadService {
  private processing = false;
  private wakeScheduled = false;
  private queueSubscription: Subscription | null = null;
  private onlineUnsubscribe: (() => void) | null = null;
  private cacheUnsubscribe: (() => void) | null = null;
  private mutationUnsubscribe: (() => void) | null = null;
  private ownerUnsubscribe: (() => void) | null = null;

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

    // Drive processing reactively from the queue itself.
    this.subscribeQueue();

    // liveQuery only tracks the DB it first resolved, but the per-user appdb rebinds on
    // Re-subscribe and schedule a run against the new instance after sign-in or an account switch.
    this.ownerUnsubscribe = subscribeOwnerChange(() => {
      this.subscribeQueue();
      this.processQueueSoon();
    });

    // Subscribe to query cache to detect new attachments
    this.cacheUnsubscribe = queryClient.getQueryCache().subscribe((event) => {
      // Only react to successful data updates for attachment list queries
      if (event.type !== 'updated') return;
      if (event.action.type !== 'success') return;

      // Compare against the key factory to keep its shape in one place.
      if (!matchesKeyPrefix(event.query.queryKey, attachmentQueryKeys.list.base)) return;

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

      if (!matchesKeyPrefix(event.mutation.options.mutationKey, attachmentQueryKeys.delete)) return;

      // Get the deleted attachments from mutation variables
      const deletedAttachments = event.mutation.state.variables as Attachment[] | undefined;
      if (!deletedAttachments?.length) return;

      // Drop both the local blobs and their queue rows; a deleted attachment will never be
      // re-downloaded, so leaving its row behind only grows the dedupe registry forever.
      const ids = deletedAttachments.map((a) => a.id);
      attachmentStorage.deleteBlobs(ids).catch((err) => {
        console.error('[DownloadService] Failed to delete local blobs:', err);
      });
      downloadQueue.remove(ids).catch((err) => {
        console.error('[DownloadService] Failed to remove queue entries:', err);
      });
    });

    console.debug('[DownloadService] Started');
  }

  /**
   * (Re)subscribe the pending-queue liveQuery against the current appdb (no-op / 0 while signed
   * out); tears down any prior subscription first. Uses a table-scan `.filter` because
   * `.where('status')` since `status` is only part of the compound `[organizationId+status]`
   * index. The queue is small, so a scan is cheap and avoids a schema migration.
   */
  private subscribeQueue(): void {
    this.queueSubscription?.unsubscribe();
    this.queueSubscription = liveQuery(() =>
      getAppDb() ? attachmentsDb.downloadQueue.filter((e) => e.status === 'pending').count() : 0,
    ).subscribe({
      next: (count) => {
        if (count > 0) this.processQueueSoon();
      },
      error: (err) => console.error('[DownloadService] Queue liveQuery error:', err),
    });
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
    if (this.ownerUnsubscribe) {
      this.ownerUnsubscribe();
      this.ownerUnsubscribe = null;
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
    if (!getAppDb()) return; // Signed out, no per-user queue to process.

    this.processing = true;

    try {
      const concurrency = this.config.downloadConcurrency ?? 2;

      // Get all pending downloads. Table scan is fine for this small table.
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

  /** Downloads variants in priority order (thumbnail, converted, original), then evicts raw. */
  private async downloadAttachment(attachmentId: string, organizationId: string): Promise<void> {
    // Look up in cache *before* claiming the row, so we don't burn an attempt on rows whose
    // metadata hasn't synced yet; the liveQuery re-triggers us once the cache fills.
    const attachment = findAttachmentInCache(attachmentId);
    if (!attachment) {
      console.debug(`[DownloadService] Attachment ${attachmentId} not in cache yet, leaving pending`);
      return;
    }

    if (!attachment.originalKey) {
      await downloadQueue.transition(attachmentId, 'skipped', SKIP_REASON_NO_ORIGINAL_KEY);
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
          // Auth/permission failures will repeat for every variant.
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
    variant: CloudFileVariant,
    organizationId: string,
  ): Promise<VariantResult> {
    // This attachment has no object for this variant.
    if (!getVariantKey(attachment, variant)) return 'skipped';

    // Already have it locally.
    if (await attachmentStorage.hasVariant(attachment.id, variant)) return 'skipped';

    // Guarded above in downloadAttachment, but keep narrow types happy.
    if (!attachment.tenantId || !attachment.organizationId) return 'failed-other';

    try {
      const url = await getCloudUrl(attachment, variant);
      if (!url) return 'skipped';

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
}

/** Background service that downloads cloud attachments for offline viewing. */
export const downloadService = new AttachmentDownloadService();
