import { appConfig } from 'shared';
import { activityBus } from '#/lib/activity-bus';
import { fanOutNotifications } from '#/modules/notification/operations/fan-out';
import { sendPendingInstantEmails } from '#/modules/notification/operations/send-instant-emails';
import { log } from '#/utils/logger';

// Activity bus listeners: product writes become per-recipient inbox rows. The fan-out skips types without a declared
// source (notification-sources.ts) and the instant email pass runs only after it wrote a row the pass mails, so both
// stay inert until a module declares one. Deletes are ignored (the inbox drops unreadable rows).
for (const entityType of appConfig.productEntityTypes) {
  for (const action of ['created', 'updated'] as const) {
    activityBus.on(`${entityType}.${action}`, async (event) => {
      if (!event.subjectId || !event.organizationId) return;
      try {
        const mailable = await fanOutNotifications(event);
        if (mailable) await sendPendingInstantEmails(event.organizationId);
      } catch (error) {
        log.error('Notification fan-out or instant email pass failed', { error, activityId: event.id });
      }
    });
  }
}
