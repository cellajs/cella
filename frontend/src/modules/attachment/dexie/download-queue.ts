/**
 * Download Queue
 *
 * Manages the download queue for background fetching of cloud attachments.
 * Modeled after React Query's mutation state machine:
 * - enqueue() — add items to queue (like mutate())
 * - transition() — explicit state transitions with validation
 * - gc() — garbage collect completed/skipped entries
 *
 * Valid status transitions:
 *   pending → downloading | skipped
 *   downloading → downloaded | failed
 *   skipped → pending (re-queue when keys arrive)
 *   failed → (terminal)
 *   downloaded → (terminal)
 */

import type { Attachment } from 'sdk';
import { appConfig } from 'shared';
import { attachmentsDb, type DownloadQueueEntry, type DownloadStatus } from './attachments-db';
import { attachmentStorage } from './storage-service';

/** Valid status transitions — mirrors RQ's internal state machine pattern */
const transitions: Record<DownloadStatus, DownloadStatus[]> = {
  pending: ['downloading', 'skipped'],
  downloading: ['downloaded', 'failed'],
  failed: [],
  skipped: ['pending'],
  downloaded: [],
};

/**
 * Transition a queue entry to a new status.
 * Validates the transition and increments attempts on pending → downloading.
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

    // Count attempts on the start of each download (pending → downloading)
    if (entry.status === 'pending' && to === 'downloading') {
      updates.attempts = entry.attempts + 1;
    }

    await attachmentsDb.downloadQueue.update(id, updates);
  } catch (error) {
    console.error(`[DownloadQueue] Failed to transition ${id} to ${to}:`, error);
  }
}

/**
 * Enqueue attachments for background download.
 *
 * The queue table itself is the registry of "have I seen this attachment?":
 *   - Any existing row (pending / downloading / downloaded / failed) is left untouched.
 *   - The single exception is rows that were `skipped` because the attachment had no
 *     `originalKey` at queue time but now has one — those get reset to `pending`.
 *
 * Skips attachments that already have a processed variant cached locally (no work to do).
 */
async function enqueue(attachments: Attachment[], organizationId: string): Promise<void> {
  if (!attachments.length) return;

  const config = appConfig.localBlobStorage;
  if (!config?.enabled) return;

  try {
    const ids = attachments.map((a) => a.id);

    // Single indexed lookup — primary key on `id` makes this O(log n).
    const existingEntries = await attachmentsDb.downloadQueue.where('id').anyOf(ids).toArray();
    const existingById = new Map(existingEntries.map((e) => [e.id, e]));

    const newEntries: DownloadQueueEntry[] = [];
    const resetIds: string[] = [];

    for (const attachment of attachments) {
      const existing = existingById.get(attachment.id);

      if (existing) {
        // Re-queue rows that were skipped solely because keys hadn't arrived yet.
        if (existing.status === 'skipped' && existing.skipReason === 'No originalKey' && attachment.originalKey) {
          resetIds.push(attachment.id);
        }
        continue;
      }

      // Skip if blob is already cached with a processed variant — nothing to download.
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
      console.debug(`[DownloadQueue] Reset ${resetIds.length} skipped entries for re-download`);
    }
  } catch (error) {
    console.error('[DownloadQueue] Failed to enqueue:', error);
  }
}

/** Garbage collect completed and skipped entries for an organization. */
async function gc(organizationId: string): Promise<void> {
  try {
    await attachmentsDb.downloadQueue
      .where('organizationId')
      .equals(organizationId)
      .filter((entry) => entry.status === 'downloaded' || entry.status === 'skipped')
      .delete();
  } catch (error) {
    console.error('[DownloadQueue] Failed to gc:', error);
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

export const downloadQueue = { enqueue, transition, gc };
