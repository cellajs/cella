import { sql } from 'drizzle-orm';
import { LogicalReplicationService, type Pgoutput, PgoutputPlugin } from 'pg-logical-replication';
import { appConfig } from 'shared';
import { activitiesTable } from '#/db/schema/activities';
import { CDC_PUBLICATION_NAME, CDC_SLOT_NAME } from './constants';
import { cdcDb } from './db';
import { env } from './env';
import { generateActivityId, recordDeadLetter, sendActivityToApi } from './lib/activity-service';
import { replicationState, type CdcHealthState, type ReplicationState } from './lib/replication-state';
import { configureWalLimits, getFreeDiskSpace, getWalBytes } from './lib/resource-monitor';
import { getErrorCode, withRetry } from './lib/retry';
import { emergencyShutdown, setShutdownHandler, startPauseWarningInterval, stopPauseWarningInterval } from './lib/wal-guard';
import { logEvent } from './pino';
import { processMessage } from './process-message';
import { activityAttrs, cdcAttrs, cdcSpanNames, recordCdcMetric, withSpan } from './tracing';
import { getNextSeq, getSeqScope } from './utils';
import { wsClient } from './websocket-client';

const LOG_PREFIX = '[worker]';

// Re-export types for external consumers
export type { CdcHealthState, ReplicationState };

// Re-export health functions for health endpoint
export { getWalBytes, getFreeDiskSpace };

/**
 * Get the time when replication was paused (null if not paused).
 */
export function getReplicationPausedAt(): Date | null {
  return replicationState.replicationPausedAt;
}

/**
 * Get current CDC health state for health endpoint.
 */
export function getCdcHealthState(): CdcHealthState {
  return replicationState.getCdcHealthState();
}

/**
 * Ensure the replication slot exists, creating it if necessary.
 * If the slot exists but is invalid, recreate it.
 */
async function ensureReplicationSlot(forceRecreate = false): Promise<void> {
  const result = await cdcDb.execute<{ slot_name: string; plugin: string }>(
    sql`SELECT slot_name, plugin FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME}`,
  );

  const slotExists = result.rows.length > 0;
  const isValid = slotExists && result.rows[0].plugin === 'pgoutput';

  if (forceRecreate && slotExists) {
    logEvent('info', `${LOG_PREFIX} Dropping invalid replication slot...`, { slotName: CDC_SLOT_NAME });
    await cdcDb.execute(sql`SELECT pg_drop_replication_slot(${CDC_SLOT_NAME})`);
  }

  if (!slotExists || forceRecreate) {
    logEvent('info', `${LOG_PREFIX} Creating replication slot...`, { slotName: CDC_SLOT_NAME });
    await cdcDb.execute(sql`SELECT pg_create_logical_replication_slot(${CDC_SLOT_NAME}, 'pgoutput')`);
    logEvent('info', `${LOG_PREFIX} Replication slot created`, { slotName: CDC_SLOT_NAME });
  } else if (!isValid) {
    logEvent('warn', `${LOG_PREFIX} Slot exists with wrong plugin, recreating...`, {
      slotName: CDC_SLOT_NAME,
      plugin: result.rows[0].plugin,
    });
    await ensureReplicationSlot(true);
  } else {
    logEvent('info', `${LOG_PREFIX} Replication slot already exists`, { slotName: CDC_SLOT_NAME });
  }
}

/**
 * Handle incoming replication data message.
 */
async function handleDataMessage(lsn: string, message: unknown): Promise<void> {
  const service = replicationState.service;
  const msg = message as Pgoutput.Message;
  const tag = msg.tag;
  const tableName = 'relation' in msg ? msg.relation?.name : undefined;

  // Early exit for seeded data (gen- prefix) - no logging to avoid flooding during seed scripts
  if (tag === 'insert' || tag === 'update' || tag === 'delete') {
    const rowData = 'new' in msg ? msg.new : 'old' in msg ? msg.old : null;
    const id = rowData && typeof rowData === 'object' ? (rowData as Record<string, unknown>).id : null;
    if (typeof id === 'string' && id.startsWith('gen-')) {
      if (wsClient.isConnected()) await service?.acknowledge(lsn);
      return;
    }
  }

  const activityId = generateActivityId(lsn);

  try {
    await withSpan(cdcSpanNames.processWal, cdcAttrs({ lsn, tag, table: tableName }), async (traceCtx) => {
      replicationState.lastLsn = lsn;
      recordCdcMetric('messagesProcessed');
      recordCdcMetric('lastProcessedAt');

      logEvent('debug', `${LOG_PREFIX} CDC message received`, { lsn, tag, table: tableName });

      const processResult = await processMessage(msg);

      if (processResult) {
        const activityWithId = { ...processResult.activity, id: activityId };

        await withSpan(cdcSpanNames.createActivity, activityAttrs(activityWithId), async () => {
          const seqScope = getSeqScope(processResult.entry, processResult.entityData);
          const seq = await getNextSeq(seqScope);

          const insertResult = await withRetry(async () => {
            await cdcDb.insert(activitiesTable).values({ ...activityWithId, seq }).onConflictDoNothing();
          }, 'insert activity');

          if (!insertResult.success) {
            await recordDeadLetter(lsn, activityId, activityWithId, insertResult.error);
            throw insertResult.error;
          }

          if (insertResult.attempts > 1) {
            logEvent('info', `${LOG_PREFIX} Activity insert succeeded after retry`, {
              activityId,
              attempts: insertResult.attempts,
              lsn,
            });
          }

          recordCdcMetric('activitiesCreated');

          logEvent('info', `${LOG_PREFIX} Activity created from CDC`, {
            type: processResult.activity.type,
            entityId: processResult.activity.entityId,
            activityId,
            lsn,
          });

          sendActivityToApi(activityWithId, processResult.entityData, traceCtx, seq);
        });
      }

      if (wsClient.isConnected()) {
        await service?.acknowledge(lsn);
      } else {
        logEvent('debug', `${LOG_PREFIX} Holding LSN acknowledgment - WebSocket disconnected`, { lsn });
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logEvent('error', `${LOG_PREFIX} Error processing CDC message - LSN NOT acknowledged`, {
      error: errorMessage,
      errorCode: getErrorCode(error),
      stack: error instanceof Error ? error.stack : undefined,
      lsn,
      tag,
      tableName,
      activityId,
    });
    recordCdcMetric('errors');
  }
}

/**
 * CDC Worker that subscribes to PostgreSQL logical replication
 * and writes activities to the activities table.
 * Implements backpressure: pauses replication when WebSocket is disconnected.
 */
export async function startCdcWorker(): Promise<void> {
  logEvent('info', `${LOG_PREFIX} CDC worker starting...`, {
    publicationName: CDC_PUBLICATION_NAME,
    slotName: CDC_SLOT_NAME,
  });

  // Configure shutdown handler for WAL guard
  setShutdownHandler(emergencyShutdown);

  await configureWalLimits();
  await ensureReplicationSlot();

  // Verify publication exists before attempting to subscribe
  const pubCheck = await cdcDb.execute<{ pubname: string }>(
    sql`SELECT pubname FROM pg_publication WHERE pubname = ${CDC_PUBLICATION_NAME}`,
  );
  if (pubCheck.rows.length === 0) {
    logEvent('error', `${LOG_PREFIX} Publication '${CDC_PUBLICATION_NAME}' not found in database. Run CDC migration first.`, {
      databaseUrl: env.DATABASE_CDC_URL.replace(/:[^:@]+@/, ':****@'), // mask password
    });
    throw new Error(`Publication '${CDC_PUBLICATION_NAME}' does not exist`);
  }
  logEvent('info', `${LOG_PREFIX} Publication verified`, { publicationName: CDC_PUBLICATION_NAME });

  // Build replication connection string from CDC URL
  const replicationUrl = new URL(env.DATABASE_CDC_URL);
  if (!replicationUrl.searchParams.has('replication')) {
    replicationUrl.searchParams.set('replication', 'database');
  }

  // Log connection details for debugging (mask password)
  const maskedUrl = new URL(replicationUrl.toString());
  maskedUrl.password = '****';
  logEvent('info', `${LOG_PREFIX} Replication connection`, {
    url: maskedUrl.toString(),
    host: replicationUrl.hostname,
    port: replicationUrl.port,
    database: replicationUrl.pathname.slice(1),
  });

  const service = new LogicalReplicationService(
    {
      connectionString: replicationUrl.toString(),
      application_name: `${appConfig.slug}-cdc-worker`,
    },
    {
      acknowledge: { auto: false, timeoutSeconds: 0 },
      flowControl: { enabled: true },
    },
  );
  replicationState.service = service;

  const plugin = new PgoutputPlugin({
    protoVersion: 1,
    publicationNames: [CDC_PUBLICATION_NAME],
  });

  // Set up WebSocket callbacks for backpressure
  wsClient.setCallbacks({
    onConnect: () => {
      logEvent('info', `${LOG_PREFIX} WebSocket connected - resuming replication acknowledgment`);
      replicationState.markActive();
      stopPauseWarningInterval();
    },
    onDisconnect: () => {
      logEvent('warn', `${LOG_PREFIX} WebSocket disconnected - pausing replication acknowledgment`);
      replicationState.markPaused();
      startPauseWarningInterval();
    },
  });

  wsClient.connect();

  // Handle incoming replication messages
  service.on('data', handleDataMessage);

  // Handle errors
  service.on('error', (error: Error) => {
    logEvent('error', `${LOG_PREFIX} CDC replication error`, { error: error.message });
  });

  // Handle heartbeats
  service.on('heartbeat', async (lsn: string, _timestamp: number, shouldRespond: boolean) => {
    if (shouldRespond && wsClient.isConnected()) {
      await service.acknowledge(lsn);
    }
  });

  // Subscribe with reconnection loop
  let consecutiveFailures = 0;
  const MAX_FAILURES_BEFORE_RECREATE = 3;

  while (true) {
    try {
      logEvent('info', `${LOG_PREFIX} Subscribing to replication slot...`);
      replicationState.replicationState = wsClient.isConnected() ? 'active' : 'paused';
      await service.subscribe(plugin, CDC_SLOT_NAME);
      consecutiveFailures = 0; // Reset on success
    } catch (error) {
      consecutiveFailures++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logEvent('warn', `${LOG_PREFIX} CDC subscription error, retrying in 5s...`, {
        error: errorMessage,
        consecutiveFailures,
      });
      replicationState.markStopped();

      // If we have persistent failures, try recreating the slot
      if (consecutiveFailures >= MAX_FAILURES_BEFORE_RECREATE) {
        logEvent('warn', `${LOG_PREFIX} Too many failures, attempting to recreate replication slot...`);
        try {
          await ensureReplicationSlot(true);
          consecutiveFailures = 0;
        } catch (recreateError) {
          logEvent('error', `${LOG_PREFIX} Failed to recreate slot`, {
            error: recreateError instanceof Error ? recreateError.message : String(recreateError),
          });
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

/**
 * Stop the CDC worker gracefully.
 */
export async function stopCdcWorker(): Promise<void> {
  logEvent('info', `${LOG_PREFIX} CDC worker stopping...`);
  stopPauseWarningInterval();
  wsClient.close();
  await replicationState.service?.stop();
  replicationState.markStopped();
}
