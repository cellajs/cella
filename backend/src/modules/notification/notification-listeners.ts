import { appConfig } from 'shared';
import { activityBus } from '#/lib/activity-bus';
import { fanOutNotifications } from '#/modules/notification/operations/fan-out';
import { log } from '#/utils/logger';

// Activity bus listeners: product writes become per-recipient inbox rows. Deletes are ignored: the inbox shows a
// subject that is gone with empty names, and the digest leaves it out.
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
