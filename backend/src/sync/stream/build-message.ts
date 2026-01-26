import { appConfig, type RealtimeEntityType } from 'config';
import type { StreamMessage, StreamNotification } from '#/schemas';
import type { ActivityEventWithEntity } from '#/sync/activity-bus';

/**
 * Build stream notification from activity event.
 * Used for notification-based sync - lightweight payload without entity data.
 */
export function buildStreamNotification(event: ActivityEventWithEntity): StreamNotification {
  // Only realtime entity types should reach this path
  if (!appConfig.realtimeEntityTypes.includes(event.entityType as RealtimeEntityType)) {
    throw new Error(`${event.entityType} is not a realtime entity type`);
  }
  if (!event.tx) {
    throw new Error(`Activity ${event.id} missing tx - realtime entities must have tx`);
  }
  return {
    action: event.action as 'create' | 'update' | 'delete',
    entityType: event.entityType as RealtimeEntityType,
    entityId: event.entityId!,
    organizationId: event.organizationId ?? null,
    seq: event.seq ?? 0,
    tx: {
      id: event.tx.id,
      sourceId: event.tx.sourceId,
      version: event.tx.version,
      fieldVersions: event.tx.fieldVersions,
    },
  };
}

/**
 * Build stream message from activity event.
 * Used by all stream types (org-scoped, public, etc.).
 * @deprecated Use buildStreamNotification for notification-based sync
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
          id: event.tx.id,
          sourceId: event.tx.sourceId,
          version: event.tx.version,
          fieldVersions: event.tx.fieldVersions,
        }
      : null,
    data: event.entity ?? null,
  };
}
