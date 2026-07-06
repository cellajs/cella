import { appConfig } from 'shared';
import { activityBus } from '#/lib/activity-bus';
import { dispatchToAppStream } from '#/modules/entities/helpers/dispatch-to-stream';
import { log } from '#/utils/logger';
import type { AppStreamEvent } from './stream/types';

/**
 * Activity bus listeners for entity changes.
 *
 * Product entity & membership events are dispatched to authenticated SSE subscribers.
 */

// Listen for product entity changes
for (const entityType of appConfig.productEntityTypes) {
  for (const action of ['created', 'updated', 'deleted'] as const) {
    activityBus.on(`${entityType}.${action}`, async (event) => {
      if (!event.subjectId || !event.organizationId) return;
      try {
        await dispatchToAppStream(event as AppStreamEvent);
      } catch (error) {
        log.error('Failed to dispatch entity change event', { error, activityId: event.id });
      }
    });
  }
}

// Listen for membership changes
for (const action of ['created', 'updated', 'deleted'] as const) {
  activityBus.on(`membership.${action}`, async (event) => {
    if (!event.organizationId) return;
    try {
      await dispatchToAppStream(event as AppStreamEvent);
    } catch (error) {
      log.error('Failed to dispatch entity change event', { error, activityId: event.id });
    }
  });
}
