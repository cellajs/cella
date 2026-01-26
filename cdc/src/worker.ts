import { sql } from 'drizzle-orm';
import { LogicalReplicationService, PgoutputPlugin } from 'pg-logical-replication';
import { db } from '#/db/db';
import { activitiesTable, type InsertActivityModel } from '#/db/schema/activities';
import { logEvent } from '#/utils/logger';
import { appConfig } from 'config';
import { CDC_PUBLICATION_NAME, CDC_SLOT_NAME } from './constants';
import { env } from './env';
import { processMessage } from './process-message';
import { getSeqScope } from './utils';
import { wsClient, type WsState } from './websocket-client';

/** Replication state for health monitoring */
export type ReplicationState = 'active' | 'paused' | 'stopped';

/** Health state exposed for monitoring */
export interface CdcHealthState {
  wsState: WsState;
  replicationState: ReplicationState;
  lastLsn: string | null;
  lastMessageAt: Date | null;
}

// Module-level state for health reporting
let replicationState: ReplicationState = 'stopped';
let lastLsn: string | null = null;
let service: LogicalReplicationService | null = null;
let replicationPausedAt: Date | null = null;

/** Warning threshold for paused replication (60 seconds) */
const PAUSE_WARNING_THRESHOLD_MS = 60_000;
let pauseWarningInterval: NodeJS.Timeout | null = null;

/**
 * Get current CDC health state for health endpoint.
 */
export function getCdcHealthState(): CdcHealthState {
  return {
    wsState: wsClient.wsState,
    replicationState,
    lastLsn,
    lastMessageAt: wsClient.lastMessageAt,
  };
}

/**
 * Ensure the replication slot exists, creating it if necessary.
 * This must be done outside of a transaction, so we do it in the worker.
 */
async function ensureReplicationSlot(): Promise<void> {
  const result = await db.execute<{ slot_name: string }>(
    sql`SELECT slot_name FROM pg_replication_slots WHERE slot_name = ${CDC_SLOT_NAME}`,
  );

  if (result.rows.length === 0) {
    logEvent('info', 'Creating replication slot...', { slotName: CDC_SLOT_NAME });
    await db.execute(sql`SELECT pg_create_logical_replication_slot(${CDC_SLOT_NAME}, 'pgoutput')`);
    logEvent('info', 'Replication slot created', { slotName: CDC_SLOT_NAME });
  } else {
    logEvent('info', 'Replication slot already exists', { slotName: CDC_SLOT_NAME });
  }
}

/**
 * Send activity + entity data to API server via WebSocket.
 */
function sendActivityToApi(activity: InsertActivityModel, entityData: Record<string, unknown>): void {
  const payload = {
    activity: {
      id: activity.id,
      type: activity.type,
      action: activity.action,
      tableName: activity.tableName,
      entityType: activity.entityType,
      resourceType: activity.resourceType,
      entityId: activity.entityId,
      userId: activity.userId,
      organizationId: activity.organizationId,
      changedKeys: activity.changedKeys,
      tx: activity.tx,
      createdAt: new Date().toISOString(),
    },
    entity: entityData,
  };

  wsClient.send(payload);
}

/**
 * Start warning interval for prolonged replication pause.
 */
function startPauseWarningInterval(): void {
  if (pauseWarningInterval) return;

  pauseWarningInterval = setInterval(() => {
    if (replicationPausedAt) {
      const pausedMs = Date.now() - replicationPausedAt.getTime();
      if (pausedMs > PAUSE_WARNING_THRESHOLD_MS) {
        logEvent('warn', 'Replication paused for extended period - WAL may be accumulating', {
          pausedSeconds: Math.round(pausedMs / 1000),
        });
      }
    }
  }, 30_000);
}

/**
 * Stop warning interval.
 */
function stopPauseWarningInterval(): void {
  if (pauseWarningInterval) {
    clearInterval(pauseWarningInterval);
    pauseWarningInterval = null;
  }
}

/**
 * CDC Worker that subscribes to PostgreSQL logical replication
 * and writes activities to the activities table.
 * Implements backpressure: pauses replication when WebSocket is disconnected.
 */
export async function startCdcWorker() {
  logEvent('info', 'CDC worker starting...', { publicationName: CDC_PUBLICATION_NAME, slotName: CDC_SLOT_NAME });

  // Ensure the replication slot exists before subscribing
  await ensureReplicationSlot();

  // Build replication connection string (add replication=database if not present)
  const replicationUrl = new URL(env.DATABASE_URL);
  if (!replicationUrl.searchParams.has('replication')) {
    replicationUrl.searchParams.set('replication', 'database');
  }

  // Create service with manual acknowledgment for backpressure control
  service = new LogicalReplicationService(
    {
      connectionString: replicationUrl.toString(),
      application_name: `${appConfig.slug}-cdc-worker`,
    },
    {
      // Manual acknowledgment: we only ACK when WebSocket is connected
      acknowledge: { auto: false, timeoutSeconds: 0 },
      // Enable flow control for async handler support
      flowControl: { enabled: true },
    },
  );

  const plugin = new PgoutputPlugin({
    protoVersion: 1,
    publicationNames: [CDC_PUBLICATION_NAME],
  });

  // Set up WebSocket callbacks for backpressure
  wsClient.setCallbacks({
    onConnect: () => {
      logEvent('info', 'WebSocket connected - resuming replication acknowledgment');
      replicationState = 'active';
      replicationPausedAt = null;
      stopPauseWarningInterval();
    },
    onDisconnect: () => {
      logEvent('warn', 'WebSocket disconnected - pausing replication acknowledgment');
      replicationState = 'paused';
      replicationPausedAt = new Date();
      startPauseWarningInterval();
    },
  });

  // Connect to API server
  wsClient.connect();

  // Handle incoming replication messages
  service.on('data', async (lsn: string, message: unknown) => {
    try {
      lastLsn = lsn;

      // Debug: log the raw message type
      const msg = message as { tag?: string; relation?: { name?: string } };
      logEvent('debug', 'CDC message received', {
        lsn,
        tag: msg.tag,
        table: msg.relation?.name,
      });

      // Process the message and create an activity if applicable
      // Async to support enrichment queries for membership events
      const processResult = await processMessage(message as Parameters<typeof processMessage>[0]);

      if (processResult) {
        // Determine seq scope dynamically based on entity hierarchy
        // Auto-detects most specific context FK (e.g., projectId before organizationId)
        const seqScope = getSeqScope(processResult.entry, processResult.entityData);

        // Insert activity with atomic seq generation
        // seq is scoped to the detected ancestor (e.g., per-project, per-org)
        await db.insert(activitiesTable).values({
          ...processResult.activity,
          // Atomic subquery: get next seq for this scope
          seq: sql`(
            SELECT COALESCE(MAX(seq), 0) + 1 
            FROM activities 
            WHERE ${sql.raw(seqScope.scopeColumn)} = ${seqScope.scopeValue}
          )`,
        });

        logEvent('info', 'Activity created from CDC', {
          type: processResult.activity.type,
          entityId: processResult.activity.entityId,
          lsn,
        });

        // Send to API server via WebSocket (includes entity data)
        sendActivityToApi(processResult.activity, processResult.entityData);
      }

      // Only acknowledge LSN if WebSocket is connected (backpressure)
      if (wsClient.isConnected()) {
        await service?.acknowledge(lsn);
      } else {
        logEvent('debug', 'Holding LSN acknowledgment - WebSocket disconnected', { lsn });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logEvent('error', 'Error processing CDC message', { error: errorMessage, stack: errorStack, lsn });
    }
  });

  // Handle errors
  service.on('error', (error: Error) => {
    logEvent('error', 'CDC replication error', { error: error.message });
  });

  // Handle heartbeats - need to acknowledge to keep connection alive
  service.on('heartbeat', async (lsn: string, _timestamp: number, shouldRespond: boolean) => {
    if (shouldRespond && wsClient.isConnected()) {
      await service?.acknowledge(lsn);
    }
  });

  // Subscribe with reconnection loop
  async function subscribeWithRetry() {
    while (true) {
      try {
        logEvent('info', 'CDC worker subscribing to replication slot...');
        replicationState = wsClient.isConnected() ? 'active' : 'paused';
        await service?.subscribe(plugin, CDC_SLOT_NAME);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logEvent('warn', 'CDC subscription error, retrying in 5s...', { error: errorMessage });
        replicationState = 'stopped';
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  await subscribeWithRetry();
}

/**
 * Stop the CDC worker gracefully.
 */
export async function stopCdcWorker() {
  logEvent('info', 'CDC worker stopping...');
  stopPauseWarningInterval();
  wsClient.close();
  await service?.stop();
  replicationState = 'stopped';
}
