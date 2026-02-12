import { nanoid } from 'nanoid';
import { activitiesTable, type InsertActivityModel } from '#/db/schema/activities';
import { cdcDb } from '../db';
import { isProductEntity } from 'shared';
import { RESOURCE_LIMITS } from '../constants';
import { logEvent } from '../pino';
import { recordCdcMetric, type TraceContext } from '../tracing';
import { wsClient } from '../websocket-client';
import { getErrorCode } from './retry';

const LOG_PREFIX = '[activity]';

/**
 * Generate a deterministic activity ID from LSN for idempotency.
 * Same LSN will always produce the same ID, preventing duplicates on replay.
 *
 * @param lsn - Log Sequence Number from PostgreSQL WAL (e.g., "0/16B3748")
 * @returns LSN with slash replaced by dash for URL/ID safety (e.g., "0-16B3748")
 */
export function generateActivityId(lsn: string): string {
  return lsn.replace('/', '-');
}

/**
 * Build activity payload for WebSocket transmission.
 * Generates cacheToken for product entities.
 */
function buildActivityPayload(
  activity: InsertActivityModel,
  entityData: Record<string, unknown>,
  traceContext: TraceContext,
  seq?: number,
) {
  // Generate cache token for product entities
  const cacheToken = activity.entityType && isProductEntity(activity.entityType) ? nanoid() : null;

  // Extract context entity IDs (organizationId, projectId, etc.) - these are dynamically generated
  const contextIds: Record<string, string | null | undefined> = {};
  for (const key of Object.keys(activity)) {
    if (key.endsWith('Id') && key !== 'entityId' && key !== 'userId') {
      contextIds[key] = (activity as Record<string, unknown>)[key] as string | null | undefined;
    }
  }

  return {
    activity: {
      id: activity.id,
      type: activity.type,
      action: activity.action,
      tableName: activity.tableName,
      entityType: activity.entityType,
      resourceType: activity.resourceType,
      entityId: activity.entityId,
      userId: activity.userId,
      ...contextIds,
      changedKeys: activity.changedKeys,
      stx: activity.stx,
      seq,
      createdAt: new Date().toISOString(),
    },
    entity: entityData,
    // Cache token for server-side entity cache
    cacheToken,
    // Include trace context for end-to-end correlation
    _trace: traceContext,
  };
}

/**
 * Send CDC message (activity + entity data) to API server via WebSocket.
 * Generates cacheToken for product entities.
 */
export function sendMessageToApi(
  activity: InsertActivityModel,
  entityData: Record<string, unknown>,
  traceContext: TraceContext,
  seq?: number,
): void {
  const payload = buildActivityPayload(activity, entityData, traceContext, seq);
  const success = wsClient.send(payload);

  if (success) {
    recordCdcMetric('wsSendSuccess');
  } else {
    recordCdcMetric('wsSendFailed');
  }
}

/**
 * Record a failed message as a dead letter in the activities table.
 * Uses the activity with error JSONB field containing all error info.
 */
export async function recordDeadLetter(
  lsn: string,
  activityId: string,
  activity: InsertActivityModel,
  error: Error,
): Promise<void> {
  try {
    await cdcDb
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
      .onConflictDoNothing();

    logEvent('error', `${LOG_PREFIX} Activity recorded as dead letter`, {
      activityId,
      lsn,
      type: activity.type,
      tableName: activity.tableName,
      errorMessage: error.message,
    });

    recordCdcMetric('errors');
  } catch (dlqError) {
    // If we can't even write the dead letter, log it but don't throw
    logEvent('fatal', `${LOG_PREFIX} Failed to record dead letter activity`, {
      activityId,
      lsn,
      originalError: error.message,
      dlqError: dlqError instanceof Error ? dlqError.message : String(dlqError),
    });
  }
}

/**
 * Insert activity into database with idempotency handling.
 * Returns true if inserted, false if already exists (replay scenario).
 */
export async function insertActivity(activity: InsertActivityModel & { id: string; seq: number }): Promise<boolean> {
  const result = await cdcDb.insert(activitiesTable).values(activity).onConflictDoNothing();

  // Check if row was actually inserted (rowCount > 0) or skipped due to conflict
  return (result.rowCount ?? 0) > 0;
}
