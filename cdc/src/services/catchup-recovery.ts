import { recalculateCounters } from '#/modules/entities/counters-queries';
import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';
import { wsClient } from '../network/websocket-client';
import { replicationState } from './replication-state';

/**
 * Recalculates skipped counters, invalidates backend caches, and resets catchup state.
 * Recovery runs after the final replay flush and before the first live event.
 */
export async function runPostCatchupRecovery(): Promise<void> {
  const startMs = performance.now();
  const eventsProcessed = replicationState.catchupEventsProcessed;

  log.info('Starting post-catchup recovery', { eventsProcessed });

  // Phase 1: recalculate counters from the source-of-truth tables.
  try {
    const { channelRows, productRows } = await recalculateCounters({ var: { db: cdcDb } });
    const durationMs = Math.round(performance.now() - startMs);
    log.info('Post-catchup counter recalculation complete', { channelRows, productRows, durationMs });
  } catch (error) {
    log.error('Post-catchup counter recalculation failed', { err: error });
  }

  // Phase 2: tell the backend to bust entity caches.
  const controlPayload = {
    _control: 'catchup_complete',
    eventsProcessed,
    catchupDurationMs: replicationState.catchupStartedAt ? Date.now() - replicationState.catchupStartedAt : null,
  };

  if (!wsClient.send(controlPayload)) {
    log.warn('Failed to send catchup_complete control message to backend');
  }

  replicationState.resetCatchup();

  const totalDurationMs = Math.round(performance.now() - startMs);
  log.info('Post-catchup recovery complete', { totalDurationMs, eventsProcessed });
}
