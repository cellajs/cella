import type { DbOrTx } from '#/db/db';
import { recalculateCounters } from '#/modules/entities/helpers/recalculate-counters';

import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';
import { replicationState } from './replication-state';
import { wsClient } from '../network/websocket-client';

/**
 * Run post-catchup recovery after the CDC worker finishes replaying old WAL.
 *
 * 1. Recalculate all counters from source data (activities are already persisted,
 *    entity seq stamps are already applied, but counter UPSERTs were skipped).
 * 2. Send a control message to the backend to bust entity caches.
 * 3. Reset catchup state.
 *
 * This runs between the last catchup flush and the first live event, so the
 * pipeline is effectively paused during recovery.
 */
export async function runPostCatchupRecovery(): Promise<void> {
  const startMs = performance.now();
  const eventsProcessed = replicationState.catchupEventsProcessed;

  log.info('Starting post-catchup recovery', { eventsProcessed });

  // Phase 1: Recalculate all counters from source-of-truth tables
  try {
    const { contextRows, productRows } = await recalculateCounters(cdcDb as unknown as DbOrTx);
    log.info('Post-catchup counter recalculation complete', {
      contextRows,
      productRows,
      durationMs: Math.round(performance.now() - startMs),
    });
  } catch (error) {
    log.error('Post-catchup counter recalculation failed', { err: error });
  }

  // Phase 2: Signal backend to bust entity caches
  const controlPayload = {
    _control: 'catchup_complete',
    eventsProcessed,
    catchupDurationMs: replicationState.catchupStartedAt ? Date.now() - replicationState.catchupStartedAt : null,
  };

  if (!wsClient.send(controlPayload)) {
    log.warn('Failed to send catchup_complete control message to backend');
  }

  // Phase 3: Reset catchup state
  replicationState.resetCatchup();

  log.info('Post-catchup recovery complete', {
    totalDurationMs: Math.round(performance.now() - startMs),
    eventsProcessed,
  });
}
