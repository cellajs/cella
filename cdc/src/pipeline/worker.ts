import { PgoutputPlugin } from 'pg-logical-replication';
import { CDC_PUBLICATION_NAME, CDC_SLOT_NAME } from '../constants';
import { log } from '../lib/pino';
import { startHealthReporter, stopHealthReporter } from '../network/health-reporter';
import { wsClient } from '../network/websocket-client';
import { metrics } from '../services/cdc-metrics';
import { replicationState } from '../services/replication-state';
import { drainBuffers } from './handle-message';
import { subscribeWithReconnect } from './replication';
import { restoreBooksState, startBooksSchedule, stopBooksSchedule } from './verify';

/** Start and stop for the CDC worker; pipeline stages are documented in @see cdc/README.md */
export async function startCdcWorker(): Promise<void> {
  log.info('CDC worker starting...', { publicationName: CDC_PUBLICATION_NAME, slotName: CDC_SLOT_NAME });

  await restoreBooksState().catch((error) => log.warn('Could not read the sync state', { err: error }));

  // Logical messages are read too: a recount marks its place in the stream with one.
  const plugin = new PgoutputPlugin({ protoVersion: 1, publicationNames: [CDC_PUBLICATION_NAME], messages: true });

  startHealthReporter();
  wsClient.connect();
  metrics.startLagPolling();
  startBooksSchedule();

  await subscribeWithReconnect(plugin);
}

/** Shutdown: the loop ends with its subscription, and what is buffered is recorded first while the API can take it. */
export async function stopCdcWorker(): Promise<void> {
  log.info('CDC worker stopping...');
  replicationState.stopping = true;
  stopHealthReporter();
  stopBooksSchedule();
  metrics.stop();
  // Without the API what is buffered stays in the WAL for the next worker.
  if (wsClient.isConnected()) await drainBuffers();
  wsClient.close();
  await replicationState.service?.stop();
}
