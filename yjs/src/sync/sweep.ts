import { YJS_CLEANUP_DELAY_MS } from '../constants';
import { listStaleDocs } from '../data/storage';
import { log } from '../lib/pino';
import { finishOrphan } from './session-manager';

/**
 * Writes the logs a relay crash left behind: every document with an uncompacted log that no session stamped within
 * the cleanup grace goes through the same locked finish as a cleanup (the log is durable, so an unmaterialized edit
 * is written now and its rows deleted; the document row stays); a log the backend did not write waits for a later
 * boot. A live session stamps its row every YJS_LIVE_TOUCH_MS, so a relay generation started next to a running one
 * never lists that one's documents. Listing runs per tenant inside tenant-scoped transactions, so the sweep sees rows
 * under the RLS-subject runtime role.
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

  log.info(`Startup sweep: found ${stale.length} document(s) with an unwritten log`);

  for (const doc of stale) {
    const outcome = await finishOrphan(doc);
    if (outcome === 'retry' || outcome === 'kept') {
      log.warn(`Startup sweep: log not written for ${doc.entityType}:${doc.entityId} (${outcome}), keeping it`);
    }
  }
}
