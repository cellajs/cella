import { matchMutation, matchQuery, onlineManager } from '@tanstack/react-query';
import { liveQuery, type Subscription } from 'dexie';
import type { Attachment } from 'sdk';
import { appConfig } from 'shared';
import { type CloudFileVariant, getCloudUrl, getVariantKey } from '~/modules/attachment/file-url';
import { attachmentsDb } from '~/modules/attachment/offline/attachments-db';
import { downloadQueue, skipReasonNoOriginalKey } from '~/modules/attachment/offline/download-queue';
import { groupBy } from '~/modules/attachment/offline/group-by';
import { attachmentStorage } from '~/modules/attachment/offline/storage-service';
import { attachmentQueryKeys, findAttachmentInCache } from '~/modules/attachment/query';
import { isPersisted } from '~/modules/attachment/types';
import { flattenInfiniteData } from '~/query/basic/flatten';
import { getLocalUserDb, subscribeOwnerChange } from '~/query/local-user-db';
import { entityIdsOf } from '~/query/offline/mutation-variables';
import { queryClient } from '~/query/query-client';

/** Variant download priority, in download order. 'raw' is local-only, so never fetched. */
const variantPriority: CloudFileVariant[] = ['thumbnail', 'preview', 'converted', 'original'];

const variantFetchTimeoutMs = 30_000;

type VariantResult = 'stored' | 'skipped' | 'failed-auth' | 'failed-other';

class AttachmentDownloadService {
  private processing = false;
  private wakeScheduled = false;
  private queueSubscription: Subscription | null = null;
  private onlineUnsubscribe: (() => void) | null = null;
  private cacheUnsubscribe: (() => void) | null = null;
  private mutationUnsubscribe: (() => void) | null = null;
  private ownerUnsubscribe: (() => void) | null = null;

  start(): void {
    if (!appConfig.localBlobStorage.enabled) {
      console.debug('[DownloadService] Local blob storage disabled');
      return;
    }

    this.onlineUnsubscribe = onlineManager.subscribe((online) => {
      if (online) this.processQueueSoon();
    });

    this.subscribeQueue();

    // liveQuery tracks only the DB it first resolved, so re-subscribe when the per-user localUserDb rebinds.
    this.ownerUnsubscribe = subscribeOwnerChange(() => {
      this.subscribeQueue();
      this.processQueueSoon();
    });

    this.cacheUnsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      if (!matchQuery({ queryKey: attachmentQueryKeys.list.base }, event.query)) return;

      const attachments = flattenInfiniteData<Attachment>(event.query.state.data);
      if (attachments.length > 0) {
        this.queueForDownload(attachments);
      }
    });

    this.mutationUnsubscribe = queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== 'updated' || !matchMutation({ mutationKey: attachmentQueryKeys.delete, status: 'success' }, event.mutation)) return;

      // Drop blobs and queue rows: a deleted attachment is never re-downloaded and its row would grow the dedupe registry.
      const ids = entityIdsOf(event.mutation.state.variables);
      if (!ids.length) return;

      attachmentStorage.deleteBlobs(ids).catch((error) => {
        console.error('[DownloadService] Failed to delete local blobs:', error);
      });
      downloadQueue.remove(ids).catch((error) => {
        console.error('[DownloadService] Failed to remove queue entries:', error);
      });
    });

    console.debug('[DownloadService] Started');
  }

  /** Replaces the pending-queue subscription for the current database, scanning the small queue since status is only in a compound index. */
  private subscribeQueue(): void {
    this.queueSubscription?.unsubscribe();
    this.queueSubscription = liveQuery(() =>
      getLocalUserDb() ? attachmentsDb.downloadQueue.filter((entry) => entry.status === 'pending').count() : 0,
    ).subscribe({
      next: (count) => {
        if (count > 0) this.processQueueSoon();
      },
      error: (error) => console.error('[DownloadService] Queue liveQuery error:', error),
    });
  }

  stop(): void {
    this.queueSubscription?.unsubscribe();
    this.queueSubscription = null;
    this.onlineUnsubscribe?.();
    this.onlineUnsubscribe = null;
    this.cacheUnsubscribe?.();
    this.cacheUnsubscribe = null;
    this.mutationUnsubscribe?.();
    this.mutationUnsubscribe = null;
    this.ownerUnsubscribe?.();
    this.ownerUnsubscribe = null;
    console.debug('[DownloadService] Stopped');
  }

  /** Schedules a queue run on the next microtask, deduped by `wakeScheduled`; processQueue guards re-entry. */
  private processQueueSoon(): void {
    if (this.wakeScheduled) return;
    this.wakeScheduled = true;
    queueMicrotask(() => {
      this.wakeScheduled = false;
      this.processQueue();
    });
  }

  async queueForDownload(attachments: Attachment[]): Promise<void> {
    if (!appConfig.localBlobStorage.enabled) return;

    // Optimistic rows are not on the server yet.
    const queueable = attachments.filter(isPersisted);
    if (!queueable.length) return;

    await downloadQueue.enqueue(queueable, queueable[0].organizationId);

    // Call directly as well: enqueue may add no pending rows for the liveQuery to observe.
    if (onlineManager.isOnline()) {
      this.processQueueSoon();
    }
  }

  async processQueue(): Promise<void> {
    if (!appConfig.localBlobStorage.enabled) return;
    if (this.processing) return;
    if (!onlineManager.isOnline()) return;
    if (!getLocalUserDb()) return; // Signed out, no per-user queue to process.

    this.processing = true;

    try {
      const pendingEntries = await attachmentsDb.downloadQueue.filter((entry) => entry.status === 'pending').toArray();

      if (pendingEntries.length === 0) return;

      for (const [organizationId, entries] of groupBy(pendingEntries, (entry) => entry.organizationId)) {
        const used = await attachmentStorage.getStorageUsed(organizationId);
        if (used >= appConfig.localBlobStorage.maxTotalSize) {
          console.debug(`[DownloadService] Storage limit reached for org ${organizationId}`);
          continue;
        }

        const sorted = entries.sort((a, b) => a.priority - b.priority).slice(0, appConfig.localBlobStorage.downloadConcurrency);

        await Promise.all(sorted.map((entry) => this.downloadAttachment(entry.id, organizationId)));
      }
    } catch (error) {
      console.error('[DownloadService] Queue processing failed:', error);
    } finally {
      this.processing = false;
    }
  }

  /** Downloads the variants in `variantPriority` order, then evicts the raw blob once the original is stored. */
  private async downloadAttachment(attachmentId: string, organizationId: string): Promise<void> {
    // Read the cache before claiming the row, so a row whose metadata has not synced does not burn an attempt.
    const attachment = findAttachmentInCache(attachmentId);
    if (!attachment) {
      console.debug(`[DownloadService] Attachment ${attachmentId} not in cache yet, leaving pending`);
      return;
    }

    if (!attachment.keys.original) {
      await downloadQueue.transition(attachmentId, 'skipped', skipReasonNoOriginalKey);
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

      if (downloadedOriginal) {
        await attachmentStorage.evictRawBlob(attachmentId);
      }

      if (downloadedAny) {
        await downloadQueue.transition(attachmentId, 'downloaded');
        console.debug(`[DownloadService] Completed downloading attachment ${attachmentId}`);
      } else {
        await downloadQueue.transition(attachmentId, 'failed');
        console.debug(`[DownloadService] No variants downloaded for ${attachmentId}, marked as failed${authFailed ? ' (auth)' : ''}`);
      }
    } catch (error) {
      console.error(`[DownloadService] Failed to download ${attachmentId}:`, error);
      await downloadQueue.transition(attachmentId, 'failed');
    }
  }

  private async downloadVariant(attachment: Attachment, variant: CloudFileVariant, organizationId: string): Promise<VariantResult> {
    if (!getVariantKey(attachment, variant)) return 'skipped';

    if (await attachmentStorage.hasVariant(attachment.id, variant)) return 'skipped';

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
        variant === 'converted' && attachment.convertedContentType ? attachment.convertedContentType : attachment.contentType || blob.type;

      await attachmentStorage.storeDownloadBlobWithVariant(attachment.id, variant, organizationId, blob, contentType);

      console.debug(`[DownloadService] Downloaded ${variant} for ${attachment.id}`);
      return 'stored';
    } catch (error) {
      console.debug(`[DownloadService] Error downloading ${variant} for ${attachment.id}:`, error);
      return 'failed-other';
    }
  }
}

/** Background service that downloads cloud attachments for offline viewing. */
export const downloadService = new AttachmentDownloadService();
