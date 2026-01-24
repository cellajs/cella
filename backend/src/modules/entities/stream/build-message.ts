import type { RealtimeEntityType } from 'config';
import type { StreamMessage } from '#/schemas';
import type { ActivityEventWithEntity } from '#/sync/activity-bus';

/**
 * Build stream message from activity event with entity data.
 */
export function buildStreamMessage(event: ActivityEventWithEntity): StreamMessage {
  return {
    activityId: event.id,
    action: event.action as 'create' | 'update' | 'delete',
    entityType: event.entityType as RealtimeEntityType,
    entityId: event.entityId!,
    changedKeys: event.changedKeys ?? null,
    createdAt: event.createdAt,
    tx: event.tx ?? null,
    // Include entity data for direct cache updates (from CDC Worker)
    data: event.entity ?? null,
  };
}
