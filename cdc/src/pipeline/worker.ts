import { PgoutputPlugin } from 'pg-logical-replication';

import { CDC_PUBLICATION_NAME, CDC_SLOT_NAME } from '../constants';
import { logEvent } from '../lib/pino';

import { replicationState } from '../services/replication-state';
import { wsClient } from '../network/websocket-client';

import { drainBuffers } from './handle-message';
import { createReplicationService, ensureReplicationSlot, setupBackpressure, subscribeWithReconnect } from './replication';

/**
 * CDC Worker orchestrator.
 *
 * Pipeline stages (reflected in file structure):
 *   1. table-registry  — what tables are tracked
 *   2. parse-message   — parse a raw WAL change into activity + row data
 *   3. handle-message  — receive, route through tx boundaries, buffer
 *   4. process-events  — persist activities → compute deltas → WS dispatch
 *   5. replication      — PG logical replication lifecycle
 *   6. worker (this)    — orchestration: start & stop
 */
export async function startCdcWorker(): Promise<void> {
  logEvent('info', `CDC worker starting...`, {
    publicationName: CDC_PUBLICATION_NAME,
    slotName: CDC_SLOT_NAME,
  });

  await ensureReplicationSlot();

  const service = createReplicationService();
  replicationState.service = service;

  const plugin = new PgoutputPlugin({
    protoVersion: 1,
    publicationNames: [CDC_PUBLICATION_NAME],
  });

  setupBackpressure();
  wsClient.connect();

  await subscribeWithReconnect(service, plugin);
}

/**
 * Stop the CDC worker gracefully.
 */
export async function stopCdcWorker(): Promise<void> {
  logEvent('info', `CDC worker stopping...`);
  await drainBuffers();
  wsClient.close();
  await replicationState.service?.stop();
  replicationState.markStopped();
}
