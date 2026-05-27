import { LogicalReplicationService, type Pgoutput, PgoutputPlugin } from 'pg-logical-replication';
import { sql } from 'drizzle-orm';
import { appConfig } from 'shared';

import { CDC_SLOT_NAME, RESOURCE_LIMITS } from '../constants';
import { cdcDb } from '../lib/db';
import { env } from '../env';
import { logError, logEvent } from '../lib/pino';

import { getErrorMessage } from '../services/get-error-message';
import { replicationState } from '../services/replication-state';
import { wsClient } from '../network/websocket-client';

import { handleDataMessage } from './handle-message';

const { reconnection } = RESOURCE_LIMITS;

// ================================
// Replication service setup
// ================================

/**
 * Build the replication connection URL from the CDC database URL.
 */
function buildReplicationUrl(): URL {
  const replicationUrl = new URL(env.DATABASE_CDC_URL);
  if (!replicationUrl.searchParams.has('replication')) {
    replicationUrl.searchParams.set('replication', 'database');
  }
  return replicationUrl;
}

/**
 * Create and configure the logical replication service.
 */
export function createReplicationService(): LogicalReplicationService {
  const connectionUrl = buildReplicationUrl();
  const service = new LogicalReplicationService(
    {
      connectionString: connectionUrl.toString(),
      application_name: `${appConfig.slug}-cdc-worker`,
    },
    {
      acknowledge: { auto: false, timeoutSeconds: 0 },
      flowControl: { enabled: true },
    },
  );

  service.on('data', (lsn: string, message: unknown) => {
    handleDataMessage(lsn, message as Pgoutput.Message);
  });

  service.on('error', (error: Error) => {
    logError(`CDC replication error`, error);
  });

  service.on('heartbeat', async (lsn: string, _timestamp: number, shouldRespond: boolean) => {
    logEvent('trace', `Heartbeat received`, { lsn, shouldRespond, wsConnected: wsClient.isConnected() });
    if (shouldRespond) {
      await service.acknowledge(lsn);
    }
  });

  return service;
}

// ================================
// Slot management
// ================================

/**
 * Ensure the replication slot exists, creating it if necessary.
 */
export async function ensureReplicationSlot(): Promise<void> {
  try {
    const slotCheck = await cdcDb.execute(
      sql`SELECT 1 FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME}`,
    );
    if (slotCheck.rows.length === 0) {
      logEvent('info', `Replication slot '${CDC_SLOT_NAME}' not found, creating...`);
      await cdcDb.execute(sql`SELECT pg_create_logical_replication_slot(${CDC_SLOT_NAME}, 'pgoutput')`);
      logEvent('info', `Replication slot '${CDC_SLOT_NAME}' created`);
    }
  } catch (error) {
    // TODO shouldnt we use logError here? perahps it should accept a message and error?
    // And can both logEvent and logError prevent fast duplication of the same error message in a short time window? 
    logEvent('warn', `Could not verify/create replication slot: ${getErrorMessage(error)}`);
  }
}

// ================================
// Backpressure
// ================================

/**
 * Wire up WebSocket callbacks for replication backpressure.
 * Pauses acknowledgment when WebSocket is disconnected.
 */
export function setupBackpressure(): void {
  wsClient.setCallbacks({
    onConnect: () => {
      const wasPaused = replicationState.status === 'paused';
      if (wasPaused) {
        logEvent('info', `WebSocket reconnected - resuming replication acknowledgment`);
      } else {
        logEvent('info', `WebSocket connected - resuming replication acknowledgment`);
      }
      replicationState.markActive();
    },
    onDisconnect: () => {
      if (!wsClient.inGracePeriod()) {
        logEvent('warn', `WebSocket disconnected - pausing replication acknowledgment`);
      }
      replicationState.markPaused();
    },
  });
}

// ================================
// Subscription loop
// ================================

/**
 * Subscribe to the replication slot with automatic reconnection.
 */
export async function subscribeWithReconnect(service: LogicalReplicationService, plugin: PgoutputPlugin): Promise<never> {
  while (true) {
    try {
      logEvent('info', `Subscribing to replication slot...`);
      replicationState.status = wsClient.isConnected() ? 'active' : 'paused';
      await service.subscribe(plugin, CDC_SLOT_NAME);
    } catch (error) {
      logEvent('warn', `Subscription error, retrying in ${reconnection.retryDelayMs / 1000}s...`, { error: getErrorMessage(error) });
      replicationState.markStopped();
      await new Promise((resolve) => setTimeout(resolve, reconnection.retryDelayMs));
    }
  }
}
