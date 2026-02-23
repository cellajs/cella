import { LogicalReplicationService, type Pgoutput, PgoutputPlugin } from 'pg-logical-replication';
import { appConfig } from 'shared';
import { activitiesTable } from '#/db/schema/activities';
import { CDC_PUBLICATION_NAME, CDC_SLOT_NAME, RESOURCE_LIMITS } from './constants';
import { cdcDb } from './db';
import { env } from './env';
import { generateActivityId, recordDeadLetter, sendMessageToApi } from './lib/activity-service';
import { replicationState } from './lib/replication-state';
import { configureWalLimits } from './lib/resource-monitor';
import { getErrorCode, withRetry } from './lib/retry';
import { emergencyShutdown, setShutdownHandler, startPauseWarningInterval, stopPauseWarningInterval } from './lib/wal-guard';
import { logEvent } from './pino';
import { processMessage } from './process-message';
import { activityAttrs, cdcAttrs, cdcSpanNames, recordCdcMetric, withSpan } from './tracing';
import { getNextSeq, getSeqScope, getCountDeltas, updateContextCounts } from './utils';
import { wsClient } from './websocket-client';

const LOG_PREFIX = '[worker]';
const { reconnection } = RESOURCE_LIMITS;

/**
 * Check if a message is from seeded data (gen- prefix) and should be skipped.
 */
function isSeededData(msg: Pgoutput.Message): boolean {
  if (msg.tag !== 'insert' && msg.tag !== 'update' && msg.tag !== 'delete') return false;
  const rowData = 'new' in msg ? msg.new : 'old' in msg ? msg.old : null;
  const id = rowData && typeof rowData === 'object' ? (rowData as Record<string, unknown>).id : null;
  return typeof id === 'string' && id.startsWith('gen-');
}

/**
 * Persist an activity to DB and send it via WebSocket.
 */
async function persistAndSendActivity(
  processResult: NonNullable<ReturnType<typeof processMessage>>,
  activityId: string,
  lsn: string,
  traceCtx: Parameters<typeof sendMessageToApi>[2],
): Promise<void> {
  const activityWithId = { ...processResult.activity, id: activityId };

  await withSpan(cdcSpanNames.createActivity, activityAttrs(activityWithId), async () => {
    const seqScope = getSeqScope(processResult.entry, processResult.entityData);
    const seq = seqScope ? await getNextSeq(seqScope) : undefined;

    // Update entity/membership counts in contextCountersTable.counts JSONB
    const countDelta = getCountDeltas(
      processResult.entry,
      activityWithId.action as 'create' | 'update' | 'delete',
      processResult.entityData,
      processResult.oldEntityData,
    );
    if (countDelta) await updateContextCounts(countDelta);

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
      ...(processResult.activity.changedKeys && { changedKeys: processResult.activity.changedKeys }),
    });

    sendMessageToApi(activityWithId, processResult.entityData, traceCtx, seq);
  });
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
  if (isSeededData(msg)) {
    if (wsClient.isConnected()) await service?.acknowledge(lsn);
    return;
  }

  const activityId = generateActivityId(lsn);

  try {
    await withSpan(cdcSpanNames.processWal, cdcAttrs({ lsn, tag, table: tableName }), async (traceCtx) => {
      replicationState.lastLsn = lsn;
      recordCdcMetric('messagesProcessed');
      recordCdcMetric('lastProcessedAt');

      logEvent('info', `${LOG_PREFIX} CDC message received`, { lsn, tag, table: tableName });

      const processResult = processMessage(msg);

      if (processResult) {
        await persistAndSendActivity(processResult, activityId, lsn, traceCtx);
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
function createReplicationService(connectionUrl: URL): LogicalReplicationService {
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
    handleDataMessage(lsn, message);
  });

  service.on('error', (error: Error) => {
    logEvent('error', `${LOG_PREFIX} CDC replication error`, { error: error.message });
  });

  service.on('heartbeat', async (lsn: string, _timestamp: number, shouldRespond: boolean) => {
    logEvent('debug', `${LOG_PREFIX} Heartbeat received`, { lsn, shouldRespond, wsConnected: wsClient.isConnected() });
    if (shouldRespond) {
      await service.acknowledge(lsn);
    }
  });

  return service;
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

  const replicationUrl = buildReplicationUrl();
  const service = createReplicationService(replicationUrl);
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

  // Subscribe with reconnection loop
  while (true) {
    try {
      logEvent('info', `${LOG_PREFIX} Subscribing to replication slot...`);
      replicationState.replicationState = wsClient.isConnected() ? 'active' : 'paused';
      await service.subscribe(plugin, CDC_SLOT_NAME);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logEvent('warn', `${LOG_PREFIX} Subscription error, retrying in ${reconnection.retryDelayMs / 1000}s...`, { error: errorMessage });
      replicationState.markStopped();
      await new Promise((resolve) => setTimeout(resolve, reconnection.retryDelayMs));
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
