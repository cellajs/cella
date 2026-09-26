import { YJS_CLEANUP_DELAY_MS } from '../constants';
import { deleteDoc, listStaleDocs } from '../data/storage';
import { log } from '../lib/pino';
import { compactDocument } from './compaction';
import { getCollab } from './session-manager';

/**
 * Finishes sessions a relay crash left behind: every stale session row goes through the same
 * compaction as a normal cleanup (the log is durable, so an unmaterialized edit is written now),
 * then its rows are deleted, as they are for an entity that is gone; a log the backend did not
 * write leaves the rows for a later boot.
 * Listing runs per tenant inside tenant-scoped transactions, so the sweep sees rows under the
 * RLS-subject runtime role.
 */
export async function runStartupSweep(): Promise<void> {
  let stale: Awaited<ReturnType<typeof listStaleDocs>>;
  try {
    stale = await listStaleDocs(YJS_CLEANUP_DELAY_MS);
  } catch (err) {
    log.warn('Startup sweep: listing stale docs failed', { err });
    return;
  }
  if (stale.length === 0) return;

  log.info(`Startup sweep: found ${stale.length} orphaned session row(s)`);

  for (const doc of stale) {
    // A document that reconnected since the listing belongs to its live session.
    if (getCollab(doc)) continue;

    let result: Awaited<ReturnType<typeof compactDocument>>;
    try {
      result = await compactDocument(doc);
    } catch (err) {
      log.warn(`Startup sweep: compaction failed for ${doc.entityType}:${doc.entityId}, keeping rows`, { err });
      continue;
    }
    if (result === 'retry' || result === 'permanent') {
      log.warn(`Startup sweep: log not written for ${doc.entityType}:${doc.entityId} (${result}), keeping rows`);
      continue;
    }

    try {
      await deleteDoc(doc);
    } catch (err) {
      log.warn(`Startup sweep: failed to delete ${doc.entityType}:${doc.entityId}`, { err });
    }
  }
}
