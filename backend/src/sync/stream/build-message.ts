import type { RealtimeEntityType } from 'config';
import type { StreamMessage } from '#/schemas';
import type { ActivityEventWithEntity } from '#/sync/activity-bus';

/**
 * Build stream message from activity event.
 * Used by all stream types (org-scoped, public, etc.).
 *
 * Note: `tx` is included for product entities (from CDC/activity).
 * `data` (entity) may be undefined when running in basic/core mode (pg_notify fallback).
 */
export function buildStreamMessage(event: ActivityEventWithEntity): StreamMessage {
  return {
    activityId: event.id,
    action: event.action as 'create' | 'update' | 'delete',
    entityType: event.entityType as RealtimeEntityType,
    entityId: event.entityId!,
    changedKeys: event.changedKeys ?? null,
    createdAt: event.createdAt,
    tx: event.tx
      ? {
          transactionId: event.tx.transactionId,
          sourceId: event.tx.sourceId,
          changedField: event.tx.changedField,
        }
      : null,
    data: event.entity ?? null,
  };
}
