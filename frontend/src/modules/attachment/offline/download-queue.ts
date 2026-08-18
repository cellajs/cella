import type { Attachment } from 'sdk';
import { appConfig } from 'shared';
import { attachmentsDb, type DownloadQueueEntry, type DownloadStatus } from './attachments-db';
import { attachmentStorage } from './storage-service';

/** Skip reason the download service writes for a row queued before its cloud keys arrived; `enqueue` matches on it to re-queue. */
export const SKIP_REASON_NO_ORIGINAL_KEY = 'No originalKey';

/** Valid transitions for the download service; `failed` is terminal here, and reviving is an `enqueue` decision that writes the row directly. */
const transitions: Record<DownloadStatus, DownloadStatus[]> = {
  pending: ['downloading', 'skipped'],
  downloading: ['downloaded', 'failed'],
  failed: [],
  skipped: ['pending'],
  downloaded: [],
};

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

    if (entry.status === 'pending' && to === 'downloading') {
      updates.attempts = entry.attempts + 1;
    }

    await attachmentsDb.downloadQueue.update(id, updates);
  } catch (error) {
    console.error(`[DownloadQueue] Failed to transition ${id} to ${to}:`, error);
  }
}

/** Enqueues attachments once, keeping active and completed entries; revives skipped rows that gained an original key and failed rows with retries left. */
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

      // Already stored locally as a processed variant.
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

/** Whether an existing entry goes back to `pending`; other rows stay untouched so the table acts as the dedupe registry. */
function shouldRevive(
  entry: DownloadQueueEntry,
  attachment: Attachment,
  config: NonNullable<typeof appConfig.localBlobStorage>,
): boolean {
  // Queued before its keys had synced; now they have.
  if (entry.status === 'skipped' && entry.skipReason === SKIP_REASON_NO_ORIGINAL_KEY && attachment.keys?.original) {
    return true;
  }

  // Retry transient fetch failures (offline, 5xx, timeout) while attempts remain.
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

/** Download priority; lower runs first. */
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
