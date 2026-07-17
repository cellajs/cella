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
    // (A membership in a new org still requires a reconnect because channel registration
    // occurs at connect time. Grants within already-subscribed orgs update live.)
    const membership = getEventData(event, 'membership');
    if (membership?.userId) {
      const subscribers = streamSubscriberManager.getByChannel<AppStreamSubscriber>(`org:${event.organizationId}`);
      for (const subscriber of subscribers) {
        if (subscriber.userId !== membership.userId) continue;
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
