import { Dexie } from 'dexie';
import type { Attachment } from 'sdk';
import { appConfig } from 'shared';
import { attachmentsDb, type DownloadQueueEntry, type DownloadStatus } from '~/modules/attachment/offline/attachments-db';

/** Writes a row's status, leaving a removed row removed; claiming a pending row counts an attempt, so tabs claiming it together count one. */
async function transition(id: string, to: DownloadStatus): Promise<void> {
  try {
    await attachmentsDb.downloadQueue.update(id, (entry) => {
      if (to === 'downloading' && entry.status === 'pending') entry.attempts += 1;
      entry.status = to;
    });
  } catch (error) {
    console.error(`[DownloadQueue] Failed to transition ${id} to ${to}:`, error);
  }
}

/** Enqueues attachments once, keeping active and completed entries so the table acts as the dedupe registry; revives failed rows with retries left. */
async function enqueue(attachments: Attachment[], organizationId: string): Promise<void> {
  if (!attachments.length) return;

  const config = appConfig.localBlobStorage;
  if (!config.enabled) return;

  try {
    const ids = attachments.map((attachment) => attachment.id);

    const existingEntries = await attachmentsDb.downloadQueue.where('id').anyOf(ids).toArray();
    const existingById = new Map(existingEntries.map((entry) => [entry.id, entry]));

    const newEntries: DownloadQueueEntry[] = [];
    const revivedIds: string[] = [];

    for (const attachment of attachments) {
      const existing = existingById.get(attachment.id);

      if (existing) {
        // Retry transient fetch failures (offline, 5xx, timeout) while attempts remain.
        if (existing.status === 'failed' && existing.attempts < config.downloadRetryAttempts) revivedIds.push(attachment.id);
        continue;
      }

      newEntries.push({
        id: attachment.id,
        organizationId,
        priority: calculatePriority(attachment),
        status: 'pending',
        queuedAt: new Date(),
        attempts: 0,
      });
    }

    if (newEntries.length > 0) {
      await addNew(newEntries);
    }

    if (revivedIds.length > 0) {
      await attachmentsDb.downloadQueue.where('id').anyOf(revivedIds).modify({ status: 'pending' });
      console.debug(`[DownloadQueue] Revived ${revivedIds.length} entries for re-download`);
    }
  } catch (error) {
    console.error('[DownloadQueue] Failed to enqueue:', error);
  }
}

/** Adds rows, tolerating keys an overlapping `enqueue` inserted after our lookup; the existing row is the dedupe outcome we want. */
async function addNew(entries: DownloadQueueEntry[]): Promise<void> {
  try {
    await attachmentsDb.downloadQueue.bulkAdd(entries);
  } catch (error) {
    // Outside a transaction bulkAdd keeps the rows that succeeded, so only a non-duplicate failure is a real error.
    if (!(error instanceof Dexie.BulkError) || error.failures.some((failure) => failure.name !== 'ConstraintError')) throw error;
  }
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

/** Newest first: the offline budget keeps the newest attachments, so they are the ones worth fetching first. */
const calculatePriority = (attachment: Attachment): number => -Date.parse(attachment.createdAt);

/** Sends finished entries back to `pending` when the offline tier grows: they lack the variants it adds. */
async function reviveDownloaded(): Promise<void> {
  try {
    await attachmentsDb.downloadQueue.filter((entry) => entry.status === 'downloaded').modify({ status: 'pending' });
  } catch (error) {
    console.error('[DownloadQueue] Failed to revive downloaded entries:', error);
  }
}

/** Queue API for background downloading of cloud attachments. */
export const downloadQueue = { enqueue, transition, remove, reviveDownloaded };
