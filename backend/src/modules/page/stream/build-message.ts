import type { RealtimeEntityType } from 'config';
import type { ActivityEventWithEntity } from '#/sync/activity-bus';

/**
 * Build public stream message with entity data.
 */
export function buildPublicPageMessage(event: ActivityEventWithEntity) {
  return {
    activityId: event.id,
    action: event.action as 'create' | 'update' | 'delete',
    entityType: event.entityType as RealtimeEntityType,
    entityId: event.entityId!,
    changedKeys: event.changedKeys ?? null,
    createdAt: event.createdAt,
    // No tx metadata for public stream
    tx: null,
    // Include entity data for direct cache updates (from CDC Worker)
    data: event.entity ?? null,
  };
}
