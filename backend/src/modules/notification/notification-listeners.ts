import { appConfig } from 'shared';
import { activityBus } from '#/lib/activity-bus';
import { log } from '#/utils/logger';
import { fanOutNotifications } from './operations/fan-out';
import { sendPendingInstantEmails } from './operations/send-instant-emails';

// Activity bus listeners: product writes become per-recipient inbox rows. Registered for every
// product type and gated per event on a declared source (notification-sources.ts), so they are
// inert until a module declares one; deletes are ignored (the inbox drops unreadable rows).
for (const entityType of appConfig.productEntityTypes) {
  for (const action of ['created', 'updated'] as const) {
    activityBus.on(`${entityType}.${action}`, async (event) => {
      if (!event.subjectId || !event.organizationId) return;
      try {
        await fanOutNotifications(event);
        await sendPendingInstantEmails(event.organizationId);
      } catch (error) {
        log.error('Failed to fan out notifications', { error, activityId: event.id });
      }
    });
  }
}
