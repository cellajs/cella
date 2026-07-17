import type { Attachment } from 'sdk';
import { appConfig } from 'shared';
import { attachmentsDb, type DownloadQueueEntry, type DownloadStatus } from './attachments-db';
import { attachmentStorage } from './storage-service';

/**
 * Skip reason for a row queued before its cloud keys arrived. Shared with the download service:
 * it writes this reason, `enqueue` matches on it to re-queue once `originalKey` shows up.
 */
export const SKIP_REASON_NO_ORIGINAL_KEY = 'No originalKey';

/**
 * Valid transitions for the download service's own state machine. `failed` is terminal *to the
 * service*. It must not resurrect a row mid-run. Reviving is an out-of-band `enqueue` decision
 * (see `shouldRevive`), so it writes the row directly without going through `transition`.
 */
const transitions: Record<DownloadStatus, DownloadStatus[]> = {
  pending: ['downloading', 'skipped'],
  downloading: ['downloaded', 'failed'],
  failed: [],
  skipped: ['pending'],
  downloaded: [],
};

/**
 * Transition a queue entry to a new status.
 * Validates the transition and increments attempts when a download starts.
 */
async function transition(id: string, to: DownloadStatus, skipReason?: string): Promise<void> {
  try {
    const entry = await attachmentsDb.downloadQueue.get(id);
    if (!entry) return;

    const allowed = transitions[entry.status];
    if (!allowed.includes(to)) {
      console.warn(`[DownloadQueue] Invalid transition ${entry.status} → ${to} for ${id}`);
      return;
    }

    const updates: Partial<DownloadQueueEntry> = { status: to };
    if (skipReason) updates.skipReason = skipReason;

    // Count attempts on the start of each download.
    if (entry.status === 'pending' && to === 'downloading') {
      updates.attempts = entry.attempts + 1;
    }

    await attachmentsDb.downloadQueue.update(id, updates);
  } catch (error) {
    console.error(`[DownloadQueue] Failed to transition ${id} to ${to}:`, error);
  }
}

/**
 * Enqueue attachments for background download. The queue table doubles as the "seen?" registry:
 * existing `pending`/`downloading`/`downloaded` rows are left untouched, which is what keeps a
 * finished attachment from being re-downloaded on every list refresh. Two kinds of row are
 * revived here, because enqueue is the natural retry trigger (the user is looking at the list
 * again, and the metadata may have changed since):
 * - `skipped` for lacking an `originalKey` at queue time, once one exists;
 * - `failed`, while it still has retry attempts left.
 * Attachments with a processed variant already stored locally are skipped.
 */
async function enqueue(attachments: Attachment[], organizationId: string): Promise<void> {
  if (!attachments.length) return;

  const config = appConfig.localBlobStorage;
  if (!config?.enabled) return;

  try {
    const ids = attachments.map((a) => a.id);

    // Single indexed lookup: primary key on `id` makes this O(log n).
    const existingEntries = await attachmentsDb.downloadQueue.where('id').anyOf(ids).toArray();
    const existingById = new Map(existingEntries.map((e) => [e.id, e]));

    const newEntries: DownloadQueueEntry[] = [];
    const resetIds: string[] = [];

    for (const attachment of attachments) {
      const existing = existingById.get(attachment.id);

      if (existing) {
        if (shouldRevive(existing, attachment, config)) resetIds.push(attachment.id);
        continue;
      }

      // Skip if the blob is already stored locally with a processed variant.
      const storedVariants = (await attachmentStorage.getStoredVariants(attachment.id)) ?? [];
      if (storedVariants.some((v) => v !== 'raw')) continue;

      const skipReason = shouldSkipDownload(attachment, config);

      newEntries.push({
        id: attachment.id,
        organizationId,
        priority: calculatePriority(attachment),
        status: skipReason ? 'skipped' : 'pending',
        skipReason,
        queuedAt: new Date(),
        attempts: 0,
      });
    }

    if (newEntries.length > 0) {
      await attachmentsDb.downloadQueue.bulkAdd(newEntries);
    }

    if (resetIds.length > 0) {
      await attachmentsDb.downloadQueue.where('id').anyOf(resetIds).modify({ status: 'pending', skipReason: null });
      console.debug(`[DownloadQueue] Revived ${resetIds.length} entries for re-download`);
    }
  } catch (error) {
    console.error('[DownloadQueue] Failed to enqueue:', error);
  }
}

/**
 * Whether an existing entry should go back to `pending`. Rows are otherwise left alone so the
 * table can act as the dedupe registry.
 */
function shouldRevive(
  entry: DownloadQueueEntry,
  attachment: Attachment,
  config: NonNullable<typeof appConfig.localBlobStorage>,
): boolean {
  // Queued before its keys had synced; now they have.
  if (entry.status === 'skipped' && entry.skipReason === SKIP_REASON_NO_ORIGINAL_KEY && attachment.originalKey) {
    return true;
  }

  // Retry transient fetch failures (offline, 5xx, timeout) while attempts remain, so one bad
  // fetch doesn't exclude an attachment from offline availability until sign-out.
  if (entry.status === 'failed' && entry.attempts < config.downloadRetryAttempts) return true;

  return false;
}

/** Drop queue entries for deleted attachments. */
async function remove(ids: string[]): Promise<void> {
  if (!ids.length) return;
  try {
    await attachmentsDb.downloadQueue.where('id').anyOf(ids).delete();
  } catch (error) {
    console.error('[DownloadQueue] Failed to remove entries:', error);
  }
}

/** Check if attachment should be skipped based on config filters. */
function shouldSkipDownload(attachment: Attachment, config: typeof appConfig.localBlobStorage): string | null {
  if (!config) return 'Config not available';

  const fileSize = attachment.size ? Number(attachment.size) : 0;
  if (config.maxFileSize && fileSize && fileSize > config.maxFileSize) {
    return `File too large (${Math.round(fileSize / 1024 / 1024)}MB > ${Math.round(config.maxFileSize / 1024 / 1024)}MB)`;
  }

  if (config.excludedContentTypes?.length && attachment.contentType) {
    for (const pattern of config.excludedContentTypes) {
      if (matchesMimePattern(attachment.contentType, pattern)) {
        return `Content type excluded: ${attachment.contentType}`;
      }
    }
  }

  if (config.allowedContentTypes?.length && attachment.contentType) {
    const allowed = config.allowedContentTypes.some((pattern) => matchesMimePattern(attachment.contentType!, pattern));
    if (!allowed) {
      return `Content type not allowed: ${attachment.contentType}`;
    }
  }

  return null;
}

function matchesMimePattern(mimeType: string, pattern: string): boolean {
  if (pattern === '*' || pattern === '*/*') return true;
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    return mimeType.startsWith(`${prefix}/`);
  }
  return mimeType === pattern;
}

/** Calculate download priority (lower = higher priority). */
function calculatePriority(attachment: Attachment): number {
  const type = attachment.contentType || '';
  if (type.startsWith('image/')) return 1;
  if (type.startsWith('audio/')) return 2;
  if (type === 'application/pdf') return 3;
  if (type.startsWith('text/')) return 4;
  if (type.startsWith('video/')) return 10;
  return 5;
}

/** Queue API for background downloading of cloud attachments. */
export const downloadQueue = { enqueue, transition, remove };
