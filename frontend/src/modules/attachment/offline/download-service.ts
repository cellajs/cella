import { matchMutation, matchQuery, onlineManager } from '@tanstack/react-query';
import { liveQuery, type Subscription } from 'dexie';
import type { Attachment } from 'sdk';
import { appConfig } from 'shared';
import { type CloudFileVariant, getCloudUrl, getVariantKey } from '~/modules/attachment/file-url';
import { attachmentsDb } from '~/modules/attachment/offline/attachments-db';
import { downloadQueue, skipReasonNoOriginalKey } from '~/modules/attachment/offline/download-queue';
import {
  currentOfflineFilesTier,
  defaultOfflineFilesTier,
  type OfflineFilesRules,
  offlineFilesRules,
  offlineFilesStore,
  offlineFilesTiers,
} from '~/modules/attachment/offline/offline-files-store';
import { attachmentStorage } from '~/modules/attachment/offline/storage-service';
import { attachmentQueryKeys, findAttachmentInCache } from '~/modules/attachment/query';
import { isPersisted } from '~/modules/attachment/types';
import { flattenInfiniteData } from '~/query/basic/flatten';
import { getLocalUserDb, subscribeOwnerChange } from '~/query/local-user-db';
import { entityIdsOf } from '~/query/offline/mutation-variables';
import { queryClient } from '~/query/query-client';
import { onChangeEvent, onSyncedRows } from '~/query/realtime/sync-signals';

/** The variants a tier fetches, previews first: the file once, as the viewer shows it (converted, else original). */
const wantedVariants = (attachment: Attachment, { previews, files }: OfflineFilesRules): CloudFileVariant[] => [
  ...(previews ? (['thumbnail', 'preview'] as const) : []),
  ...(files ? [getVariantKey(attachment, 'converted') ? ('converted' as const) : ('original' as const)] : []),
];

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
  private tierUnsubscribe: (() => void) | null = null;
  private syncUnsubscribes: (() => void)[] = [];

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
      void this.applyTier(false);
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
      this.purge(entityIdsOf(event.mutation.state.variables));
    });

    // A delete by anyone else arrives through sync: a tombstone row in a fetched range, or a hard delete's announcement.
    this.syncUnsubscribes = [
      onSyncedRows(({ entityType, rows }) => {
        if (entityType === 'attachment') this.purge(rows.filter((row) => row.deletedAt).map((row) => row.id));
      }),
      onChangeEvent(({ entityType, action, subjectId }) => {
        if (entityType === 'attachment' && action === 'delete' && subjectId) this.purge([subjectId]);
      }),
    ];

    this.tierUnsubscribe = offlineFilesStore.subscribe((state, previous) => {
      const [tier, before] = [state.tier ?? defaultOfflineFilesTier(), previous.tier ?? defaultOfflineFilesTier()];
      if (tier !== before) void this.applyTier(offlineFilesTiers.indexOf(tier) > offlineFilesTiers.indexOf(before));
    });
    void this.applyTier(false);

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

  /** Drops a deleted attachment's blobs and queue row: it is never re-downloaded, and its row would grow the dedupe registry. */
  private purge(ids: string[]): void {
    if (!ids.length || !getLocalUserDb()) return;
    attachmentStorage.deleteBlobs(ids).catch((error) => {
      console.error('[DownloadService] Failed to delete local blobs:', error);
    });
    downloadQueue.remove(ids).catch((error) => {
      console.error('[DownloadService] Failed to remove queue entries:', error);
    });
  }

  /**
   * Trims stored blobs to the current tier. A larger tier also sends finished entries back for the variants it adds;
   * otherwise a finished entry stays finished, so a file the budget dropped is not fetched again.
   */
  private async applyTier(grew: boolean): Promise<void> {
    if (!getLocalUserDb()) return;
    try {
      await attachmentStorage.trimToTier(offlineFilesRules(currentOfflineFilesTier()));
      if (grew) await downloadQueue.reviveDownloaded();
      this.processQueueSoon();
    } catch (error) {
      console.error('[DownloadService] Failed to apply the offline files tier:', error);
    }
  }

  stop(): void {
    this.tierUnsubscribe?.();
    this.tierUnsubscribe = null;
    for (const unsubscribe of this.syncUnsubscribes) unsubscribe();
    this.syncUnsubscribes = [];
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

    const rules = offlineFilesRules(currentOfflineFilesTier());
    if (!rules.previews) return;

    this.processing = true;
    let claimedAny = false;

    try {
      const pending = await attachmentsDb.downloadQueue.filter((entry) => entry.status === 'pending').toArray();
      if (pending.length === 0) return;

      // A full budget still takes attachments newer than the oldest one stored: the trim below drops that one.
      const { bytes, oldestRank } = await attachmentStorage.offlineUsage();
      const batch = pending
        .filter((entry) => bytes < rules.budget || -entry.priority > oldestRank)
        .sort((a, b) => a.priority - b.priority)
        .slice(0, appConfig.localBlobStorage.downloadConcurrency);
      if (batch.length === 0) return;

      const claimed = await Promise.all(batch.map((entry) => this.downloadAttachment(entry.id, entry.organizationId, rules)));
      claimedAny = claimed.includes(true);
      await attachmentStorage.trimToTier(rules);
    } catch (error) {
      console.error('[DownloadService] Queue processing failed:', error);
    } finally {
      this.processing = false;
      // The next batch; a row left pending for metadata not yet synced waits for the next wake.
      if (claimedAny) this.processQueueSoon();
    }
  }

  /**
   * Downloads the variants the tier wants, then evicts the raw upload blob once the file is stored.
   * @returns Whether the entry left `pending`.
   */
  private async downloadAttachment(attachmentId: string, organizationId: string, rules: OfflineFilesRules): Promise<boolean> {
    // Read the cache before claiming the row, so a row whose metadata has not synced does not burn an attempt.
    const attachment = findAttachmentInCache(attachmentId);
    if (!attachment) {
      console.debug(`[DownloadService] Attachment ${attachmentId} not in cache yet, leaving pending`);
      return false;
    }

    if (!attachment.keys.original) {
      await downloadQueue.transition(attachmentId, 'skipped', skipReasonNoOriginalKey);
      return true;
    }

    // Claim the row.
    await downloadQueue.transition(attachmentId, 'downloading');

    try {
      const results: VariantResult[] = [];
      for (const variant of wantedVariants(attachment, rules)) {
        const result = await this.downloadVariant(attachment, variant, organizationId);
        results.push(result);
        // Auth/permission failures will repeat for every variant.
        if (result === 'failed-auth') break;
        if (result === 'stored' && (variant === 'converted' || variant === 'original')) await attachmentStorage.evictRawBlob(attachmentId);
      }

      // Nothing to fetch (stored before, or no key for what the tier wants) counts as done, a revived entry included.
      const failed = results.some((result) => result === 'failed-auth' || result === 'failed-other');
      const stored = results.includes('stored');
      await downloadQueue.transition(attachmentId, failed && !stored ? 'failed' : 'downloaded');
      console.debug(`[DownloadService] ${failed && !stored ? 'Failed' : 'Finished'} downloading attachment ${attachmentId}`);
    } catch (error) {
      console.error(`[DownloadService] Failed to download ${attachmentId}:`, error);
      await downloadQueue.transition(attachmentId, 'failed');
    }
    return true;
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

      await attachmentStorage.storeDownloadBlobWithVariant(
        attachment.id,
        variant,
        organizationId,
        blob,
        contentType,
        Date.parse(attachment.createdAt),
      );

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
