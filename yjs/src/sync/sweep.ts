import { YJS_CLEANUP_DELAY_MS } from '../constants';
import { listStaleDocs } from '../data/storage';
import { log } from '../lib/pino';
import { finishOrphan } from './session-manager';

/** The sweep under way on this relay, if any: a run that comes due meanwhile joins it. */
let running: Promise<void> | null = null;

/**
 * Writes the logs no session holds: every document with an uncompacted log that no session stamped within the cleanup
 * grace, and no log row younger than it, goes through the same locked finish as a cleanup (the log is durable, so an
 * unmaterialized edit is written now and its rows deleted; the document row stays). Those are the logs a relay crash
 * left behind, and the rows clients posted over HTTP while they could not reach a relay. A log the backend did not
 * write waits for a later sweep. A live session stamps its row every YJS_LIVE_TOUCH_MS, so a relay generation started
 * next to a running one never lists that one's documents, and a document with a session on this relay is left to it.
 * Listing runs per tenant inside tenant-scoped transactions, so the sweep sees rows under the RLS-subject runtime role.
 * One sweep runs at a time on a relay: a call while one runs returns that one.
 */
export function runSweep(): Promise<void> {
  running ??= sweepOnce().finally(() => {
    running = null;
  });
  return running;
}

async function sweepOnce(): Promise<void> {
  let stale: Awaited<ReturnType<typeof listStaleDocs>>;
  try {
    stale = await listStaleDocs(YJS_CLEANUP_DELAY_MS);
  } catch (err) {
    log.warn('Sweep: listing stale docs failed', { err });
    return;
  }
  if (stale.length === 0) return;

  log.info(`Sweep: found ${stale.length} document(s) with an unwritten log`);

  for (const doc of stale) {
    const outcome = await finishOrphan(doc);
    if (outcome === 'retry' || outcome === 'kept') {
      log.warn(`Sweep: log not written for ${doc.entityType}:${doc.entityId} (${outcome}), keeping it`);
    }
  }
}

/**
 * Sweeps every YJS_CLEANUP_DELAY_MS from now on, besides the sweep at boot: a document edited over HTTP alone is
 * folded 5 to 10 minutes after its last post, while the relay stays up. Returns the stop. The timer never keeps the
 * process alive.
 */
export function startPeriodicSweep(): () => void {
  const timer = setInterval(() => {
    runSweep().catch((err) => log.warn('Sweep failed', { err }));
  }, YJS_CLEANUP_DELAY_MS).unref();
  return () => clearInterval(timer);
}
