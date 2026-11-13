import type { YjsDocScope } from 'shared';
import { docKey, yjsFinishDelayMs } from '../constants';
import { findStaleDocuments } from '../data/storage';
import { log } from '../lib/pino';
import { finishOrphan } from './session-manager';

/** The sweep under way on this relay, if any: a run that comes due meanwhile joins it. */
let running: Promise<void> | null = null;

/**
 * Writes the logs no session holds: every document with an uncompacted log that no session stamped within the finish
 * grace, and no log row younger than it, goes through the same locked finish as an idle session's. The log is durable:
 * an unmaterialized edit is written now and its rows deleted, and the document row stays. Those are the logs a relay crash
 * left behind, and the rows clients posted over HTTP while they could not reach a relay. A log the backend did not
 * write waits for a later sweep. A live session stamps its row every yjsLiveStampMs, so a relay generation started
 * next to a running one never lists that one's documents, and a document with a session on this relay is left to it.
 * Listing runs per tenant inside tenant-scoped transactions, so the sweep sees rows under the RLS-subject runtime role.
 * One sweep runs at a time on a relay: a call while one runs returns that one.
 */
export function materializeOrphanedLogs(): Promise<void> {
  running ??= sweepOnce().finally(() => {
    running = null;
  });
  return running;
}

async function sweepOnce(): Promise<void> {
  let stale: YjsDocScope[];
  try {
    stale = await findStaleDocuments(yjsFinishDelayMs);
  } catch (err) {
    log.warn('Orphaned logs: listing stale docs failed', { err });
    return;
  }
  if (stale.length === 0) return;

  log.info(`Orphaned logs: found ${stale.length} document(s) with an unwritten log`);

  for (const doc of stale) {
    if ((await finishOrphan(doc)) === 'retry') log.error(`Orphaned logs: log not written for ${docKey(doc)}, keeping it`);
  }
}

/**
 * Sweeps every yjsFinishDelayMs from now on, besides the sweep at boot: a document edited over HTTP alone is
 * folded 5 to 10 minutes after its last post, while the relay stays up. Returns the stop. The timer never keeps the
 * process alive.
 */
export function startPeriodicSweep(): () => void {
  const timer = setInterval(() => {
    materializeOrphanedLogs().catch((err) => log.warn('Sweep failed', { err }));
  }, yjsFinishDelayMs).unref();
  return () => clearInterval(timer);
}
