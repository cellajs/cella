import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { LogicalReplicationService, type Pgoutput, PgoutputPlugin } from 'pg-logical-replication';
import { db } from '#/db/db';
import { activitiesTable, type InsertActivityModel } from '#/db/schema/activities';
import { appConfig, isProductEntity } from 'config';
import { CDC_PUBLICATION_NAME, CDC_SLOT_NAME, RESOURCE_LIMITS } from './constants';
import { env } from './env';
import { getErrorCode, withRetry } from './lib/retry';
import { logEvent } from './pino';
import { processMessage } from './process-message';
import { activityAttrs, cdcAttrs, cdcSpanNames, recordCdcMetric, withSpan, type TraceContext } from './tracing';
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

/**
 * Get the time when replication was paused (null if not paused).
 */
export function getReplicationPausedAt(): Date | null {
  return replicationPausedAt;
}
const { wal: WAL, startup, runtime } = RESOURCE_LIMITS;

let pauseWarningInterval: NodeJS.Timeout | null = null;

/**
 * Get the current WAL bytes accumulated for the CDC slot.
 * Returns null if unable to determine.
 */
export async function getWalBytes(): Promise<number | null> {
  try {
    const result = await db.execute<{ pg_wal_lsn_diff: bigint; confirmed_flush_lsn: string | null; restart_lsn: string | null }>(
      sql`
        SELECT 
          pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) as pg_wal_lsn_diff,
          confirmed_flush_lsn,
          restart_lsn
        FROM pg_replication_slots 
        WHERE slot_name = ${CDC_SLOT_NAME}
      `
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    // pg_wal_lsn_diff returns bytes as bigint
    return Number(result.rows[0].pg_wal_lsn_diff);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logEvent('error', 'Failed to query WAL bytes', { error: errorMessage });
    return null;
  }
}

/** Get available disk space (null if can't determine) */
export function getFreeDiskSpace(): number | null {
  for (const dir of ['/var/lib/postgresql', '/data', '/var/lib/pgsql', '/opt/homebrew/var/postgresql', '.']) {
    try {
      const output = execSync(`df -B1 ${dir} 2>/dev/null | tail -1 | awk '{print $4}'`, { encoding: 'utf-8' });
      const bytes = parseInt(output.trim(), 10);
      if (bytes > 0) return bytes;
    } catch { /* try next */ }
  }
  return null;
}

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

const fmtBytes = (b: number) => b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(2)} MB`;

/** Configure WAL limits based on available disk space */
async function configureWalLimits(): Promise<void> {
  const free = getFreeDiskSpace();
  if (free === null) {
    logEvent('warn', 'Could not determine disk space, using default WAL limits');
    return;
  }

  if (free < startup.minFreeDisk) {
    const msg = `Insufficient disk: ${fmtBytes(free)} < ${fmtBytes(startup.minFreeDisk)} required`;
    logEvent('fatal', msg);
    throw new Error(msg);
  }

  const limit = Math.min(WAL.maxSize, Math.max(WAL.minSize, Math.floor(free * WAL.percentageOfDisk)));
  const limitGB = Math.floor(limit / 1e9);

  logEvent('info', 'Configuring WAL limits', { free: fmtBytes(free), limit: fmtBytes(limit) });

  try {
    await db.execute(sql`ALTER SYSTEM SET max_slot_wal_keep_size = ${limitGB}GB`);
    await db.execute(sql`SELECT pg_reload_conf()`);
    logEvent('info', 'WAL limits configured', { max_slot_wal_keep_size: `${limitGB}GB` });
  } catch (err) {
    logEvent('error', 'Failed to configure WAL limits', { error: err instanceof Error ? err.message : String(err) });
  }
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
 * Generates cacheToken for product entities.
 */
function sendActivityToApi(
  activity: InsertActivityModel,
  entityData: Record<string, unknown>,
  traceContext: TraceContext,
): void {
  // Generate cache token for product entities
  const cacheToken = activity.entityType && isProductEntity(activity.entityType) ? nanoid() : null;

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
    // Cache token for server-side entity cache
    cacheToken,
    // Include trace context for end-to-end correlation
    _trace: traceContext,
  };

  const success = wsClient.send(payload);
  if (success) {
    recordCdcMetric('wsSendSuccess');
  } else {
    recordCdcMetric('wsSendFailed');
  }
}

/**
 * Generate a deterministic activity ID from LSN for idempotency.
 * Same LSN + table will always produce the same ID, preventing duplicates on replay.
 */
function generateActivityId(lsn: string, tableName: string): string {
  // Create a hash of LSN + table for deterministic ID
  const hash = createHash('sha256').update(`${lsn}:${tableName}`).digest('hex');
  // Use first 21 chars to match nanoid length, prefix with 'cdc-' for identification
  return `cdc-${hash.slice(0, 17)}`;
}

/**
 * Record a failed message as a dead letter in the activities table.
 * Uses the activity with error JSONB field containing all error info.
 */
async function recordDeadLetter(
  lsn: string,
  activityId: string,
  activity: InsertActivityModel,
  error: Error,
): Promise<void> {
  try {
    await db
      .insert(activitiesTable)
      .values({
        ...activity,
        id: activityId,
        error: {
          lsn,
          message: error.message,
          code: getErrorCode(error),
          retryCount: RESOURCE_LIMITS.retry.maxAttempts,
          resolved: false,
        },
      })
      .onConflictDoNothing()

    logEvent('error', 'Activity recorded as dead letter', {
      activityId,
      lsn,
      type: activity.type,
      tableName: activity.tableName,
      errorMessage: error.message,
    });

    recordCdcMetric('errors');
  } catch (dlqError) {
    // If we can't even write the dead letter, log it but don't throw
    logEvent('fatal', 'Failed to record dead letter activity', {
      activityId,
      lsn,
      originalError: error.message,
      dlqError: dlqError instanceof Error ? dlqError.message : String(dlqError),
    });
  }
}

/**
 * Emergency shutdown handler.
 * Stops replication service, closes WebSocket, and exits process.
 * Called when WAL accumulation exceeds safe limits.
 */
async function emergencyShutdown(reason: string): Promise<never> {
  logEvent('fatal', 'Initiating emergency shutdown...', { reason });
  
  try {
    // Stop the warning interval first
    stopPauseWarningInterval();
    
    // Close WebSocket connection
    wsClient.close();
    
    // Stop replication service
    if (service) {
      await service.stop();
    }
    
    replicationState = 'stopped';
    
    logEvent('fatal', 'Emergency shutdown complete', { reason });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logEvent('error', 'Error during emergency shutdown', { error: errorMessage });
  }
  
  // Exit with error code so orchestrator can restart with fresh state
  process.exit(1);
}

/**
 * Start warning interval for WAL accumulation monitoring.
 * Triggers emergency shutdown if WAL size or disk space exceeds safe limits.
 */
function startPauseWarningInterval(): void {
  if (pauseWarningInterval) return;

  pauseWarningInterval = setInterval(async () => {
    if (!replicationPausedAt) return;

    const pausedMs = Date.now() - replicationPausedAt.getTime();
    const walBytes = await getWalBytes();
    const freeDiskBytes = getFreeDiskSpace();

    // Check emergency shutdown conditions
    if (walBytes !== null && walBytes > runtime.walShutdownBytes) {
      const errorMsg = `Emergency shutdown: WAL accumulation exceeded ${runtime.walShutdownBytes} bytes (current: ${walBytes} bytes)`;
      logEvent('fatal', errorMsg, {
        walBytes,
        maxWalBytes: runtime.walShutdownBytes,
        lastLsn,
        pausedSeconds: Math.round(pausedMs / 1000),
      });
      void emergencyShutdown(errorMsg);
      return;
    }

    if (freeDiskBytes !== null && freeDiskBytes < runtime.diskShutdownBytes) {
      const errorMsg = `Emergency shutdown: Free disk space below ${runtime.diskShutdownBytes} bytes (available: ${freeDiskBytes} bytes)`;
      logEvent('fatal', errorMsg, {
        freeDiskBytes,
        minFreeDiskBytes: runtime.diskShutdownBytes,
        lastLsn,
        pausedSeconds: Math.round(pausedMs / 1000),
      });
      void emergencyShutdown(errorMsg);
      return;
    }

    // Check warning thresholds
    if (walBytes !== null && walBytes > runtime.walWarningBytes) {
      logEvent('warn', 'WAL accumulation approaching limit', {
        walBytes,
        warningWalBytes: runtime.walWarningBytes,
        maxWalBytes: runtime.walShutdownBytes,
        pausedSeconds: Math.round(pausedMs / 1000),
      });
    }

    if (freeDiskBytes !== null && freeDiskBytes < runtime.diskWarningBytes) {
      logEvent('warn', 'Free disk space running low', {
        freeDiskBytes,
        warningFreeDiskBytes: runtime.diskWarningBytes,
        minFreeDiskBytes: runtime.diskUnhealthyBytes,
        pausedSeconds: Math.round(pausedMs / 1000),
      });
    }

    // Time-based warning as fallback
    if (pausedMs > runtime.pauseWarningMs) {
      logEvent('warn', 'Replication paused for extended period', {
        pausedSeconds: Math.round(pausedMs / 1000),
        walBytes,
        freeDiskBytes,
      });
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

  // Configure WAL limits based on available disk space
  await configureWalLimits();

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
    // Type the message - pg-logical-replication types it as unknown but it's always Pgoutput.Message
    const msg = message as Pgoutput.Message;
    const tag = msg.tag;
    const tableName = 'relation' in msg ? msg.relation?.name : undefined;

    // Early exit for seeded data (gen- prefix) - no logging to avoid flooding during seed scripts
    if (tag === 'insert' || tag === 'update' || tag === 'delete') {
      const rowData = 'new' in msg ? msg.new : 'old' in msg ? msg.old : null;
      const id = rowData && typeof rowData === 'object' ? (rowData as Record<string, unknown>).id : null;
      if (typeof id === 'string' && id.startsWith('gen-')) {
        // Acknowledge LSN to advance replication, but skip processing entirely
        if (wsClient.isConnected()) await service?.acknowledge(lsn);
        return;
      }
    }

    // Generate deterministic activity ID from LSN for idempotency
    // This ensures duplicate processing (after replay) results in same ID
    const activityId = generateActivityId(lsn, tableName ?? 'unknown');

    try {
      await withSpan(cdcSpanNames.processWal, cdcAttrs({ lsn, tag, table: tableName }), async (traceCtx) => {
        lastLsn = lsn;
        recordCdcMetric('messagesProcessed');
        recordCdcMetric('lastProcessedAt');

        logEvent('debug', 'CDC message received', { lsn, tag, table: tableName });

        // Process the message and create an activity if applicable
        const processResult = await processMessage(msg);

        if (processResult) {
          // Use deterministic ID for idempotency
          const activityWithId = { ...processResult.activity, id: activityId };

          await withSpan(cdcSpanNames.createActivity, activityAttrs(activityWithId), async () => {
            // Determine seq scope dynamically based on entity hierarchy
            const seqScope = getSeqScope(processResult.entry, processResult.entityData);

            // Insert activity with retry for transient errors
            const insertResult = await withRetry(async () => {
              await db
                .insert(activitiesTable)
                .values({
                  ...activityWithId,
                  seq: sql`(
                  SELECT COALESCE(MAX(seq), 0) + 1 
                  FROM activities 
                  WHERE ${sql.raw(seqScope.scopeColumn)} = ${seqScope.scopeValue}
                )`,
                })
                .onConflictDoNothing(); // Idempotency: skip if already exists (replay scenario)
            }, 'insert activity');

            if (!insertResult.success) {
              // All retries exhausted - record as dead letter in activities table
              await recordDeadLetter(lsn, activityId, activityWithId, insertResult.error);

              // Throw to prevent LSN acknowledgment and WebSocket send
              throw insertResult.error;
            }

            if (insertResult.attempts > 1) {
              logEvent('info', 'Activity insert succeeded after retry', {
                activityId,
                attempts: insertResult.attempts,
                lsn,
              });
            }

            recordCdcMetric('activitiesCreated');
          });

          logEvent('info', 'Activity created from CDC', {
            type: processResult.activity.type,
            entityId: processResult.activity.entityId,
            activityId,
            lsn,
          });

          // Send to API server via WebSocket (only after successful insert)
          sendActivityToApi(activityWithId, processResult.entityData, traceCtx);
        }

        // Only acknowledge LSN after successful processing and if WebSocket is connected
        if (wsClient.isConnected()) {
          await service?.acknowledge(lsn);
        } else {
          logEvent('debug', 'Holding LSN acknowledgment - WebSocket disconnected', { lsn });
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = getErrorCode(error);

      logEvent('error', 'Error processing CDC message - LSN NOT acknowledged', {
        error: errorMessage,
        errorCode,
        stack: error instanceof Error ? error.stack : undefined,
        lsn,
        tag,
        tableName,
        activityId,
      });

      recordCdcMetric('errors');

      // DO NOT acknowledge LSN on error - message will be reprocessed on restart
      // The deterministic activityId ensures idempotency on replay
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
