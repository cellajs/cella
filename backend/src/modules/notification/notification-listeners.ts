import { appConfig } from 'shared';
import { activityBus } from '#/lib/activity-bus';
import { fanOutNotifications } from '#/modules/notification/operations/fan-out';
import { log } from '#/utils/logger';

// Activity bus listeners: product writes become per-recipient inbox rows. The fan-out skips types without a declared
// source (notification-sources.ts), so it stays inert until a module declares one. Deletes are ignored (the inbox
// drops unreadable rows).
for (const entityType of appConfig.productEntityTypes) {
  for (const action of ['created', 'updated'] as const) {
    activityBus.on(`${entityType}.${action}`, async (event) => {
      try {
        await fanOutNotifications(event);
      } catch (error) {
        log.error('Notification fan-out failed', { error, activityIds: event.rows.map((row) => row.activityId) });
      }
    });
  }
}
