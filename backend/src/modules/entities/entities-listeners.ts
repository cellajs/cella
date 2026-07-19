import { appConfig } from 'shared';
import { activityBus, getEventData } from '#/lib/activity-bus';
import {
  type AppStreamSubscriber,
  dispatchMoveOuts,
  dispatchToAppStream,
} from '#/modules/entities/helpers/dispatch-to-stream';
import { toMembershipBase } from '#/modules/memberships/helpers/select';
import { log } from '#/utils/logger';
import { streamSubscriberManager } from './stream';
import type { AppStreamEvent, AppStreamProductEvent } from './stream/types';

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
        // Reparented rows additionally notify old-path readers who lost visibility
        if (action === 'updated') await dispatchMoveOuts(event as AppStreamProductEvent);
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

    // Keep connected subscribers' membership snapshots fresh BEFORE dispatch: the
    // dispatch decision must mirror the API, which reads live memberships per request.
    // The user channel reaches the subject's connections even when the membership's org
    // was not registered at connect time; product events for a NEW org still need the
    // client reconnect (org channel registration happens at connect).
    const membership = getEventData(event, 'membership');
    if (membership?.userId) {
      const subscribers = streamSubscriberManager.getByChannel<AppStreamSubscriber>(`user:${membership.userId}`);
      for (const subscriber of subscribers) {
        const remaining = subscriber.memberships.filter((existing) => existing.id !== membership.id);
        subscriber.memberships =
          action === 'deleted' ? remaining : [...remaining, toMembershipBase(membership as Record<string, unknown>)];
      }
    }

    try {
      await dispatchToAppStream(event as AppStreamEvent);
    } catch (error) {
      log.error('Failed to dispatch entity change event', { error, activityId: event.id });
    }
  });
}
