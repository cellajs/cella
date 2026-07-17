import { PgoutputPlugin } from 'pg-logical-replication';

import { CDC_PUBLICATION_NAME, CDC_SLOT_NAME } from '../constants';
import { log } from '../lib/pino';

import { replicationState } from '../services/replication-state';
import { cdcMetrics } from '../services/cdc-metrics';
import { wsClient } from '../network/websocket-client';
import { startHealthReporter, stopHealthReporter } from '../network/health-reporter';

import { drainBuffers } from './handle-message';
import { createReplicationService, setupBackpressure, subscribeWithReconnect } from './replication';

/**
 * CDC Worker orchestrator: start & stop. Pipeline stages and their file layout are
 * documented under "Pipeline stages".
 *
 * @see cdc/README.md
 */
export async function startCdcWorker(): Promise<void> {
  log.info(`CDC worker starting...`, {
    publicationName: CDC_PUBLICATION_NAME,
    slotName: CDC_SLOT_NAME,
  });

  const service = createReplicationService();
  replicationState.service = service;

  const plugin = new PgoutputPlugin({
    protoVersion: 1,
    publicationNames: [CDC_PUBLICATION_NAME],
  });

  setupBackpressure();
  wsClient.connect();
  startHealthReporter();
  cdcMetrics.startLagPolling();

  await subscribeWithReconnect(service, plugin);
}

/**
 * Stop the CDC worker gracefully.
 */
export async function stopCdcWorker(): Promise<void> {
  log.info(`CDC worker stopping...`);
  stopHealthReporter();
  cdcMetrics.stop();
  await drainBuffers();
  wsClient.close();
  await replicationState.service?.stop();
  replicationState.markStopped();
}
