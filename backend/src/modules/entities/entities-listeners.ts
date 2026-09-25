import { appConfig } from 'shared';
import { activityBus, getEventData } from '#/lib/activity-bus';
import { authEvents } from '#/modules/auth/auth-events';
import {
  type AppStreamSubscriber,
  dispatchMoveOuts,
  dispatchToAppStream,
} from '#/modules/entities/helpers/dispatch-to-stream';
import { closeAppStreams, streamErrorForEnding } from '#/modules/entities/helpers/session-streams';
import { toMembershipBase } from '#/modules/memberships/helpers/select';
import { log } from '#/utils/logger';
import { streamSubscriberManager } from './stream';
import type { AppStreamEvent, AppStreamProductEvent } from './stream/types';

// Activity bus listeners: product entity and membership events reach authenticated SSE subscribers.
for (const entityType of appConfig.productEntityTypes) {
  for (const action of ['created', 'updated', 'deleted'] as const) {
    activityBus.on(`${entityType}.${action}`, async (event) => {
      if (!event.subjectId || !event.organizationId) return;
      try {
        await dispatchToAppStream(event as AppStreamEvent);
        // Reparented rows also notify old-path readers who lost visibility.
        if (action === 'updated') await dispatchMoveOuts(event as AppStreamProductEvent);
      } catch (error) {
        log.error('Failed to dispatch entity change event', { error, activityId: event.id });
      }
    });
  }
}

// Closes the streams bound to ended sessions, each with the code that tells the client whether to reconnect.
authEvents.on('session.revoked', async ({ userId, sessionIds, reason }) => {
  const payload = streamErrorForEnding(reason);
  const ended = streamSubscriberManager
    .getByChannel<AppStreamSubscriber>(`user:${userId}`)
    .filter((subscriber) => sessionIds === 'all' || sessionIds.includes(subscriber.sessionId))
    .map((subscriber) => ({ subscriber, payload }));
  await closeAppStreams(ended, 'Failed to close the stream of an ended session');
});

for (const action of ['created', 'updated', 'deleted'] as const) {
  activityBus.on(`membership.${action}`, async (event) => {
    if (!event.organizationId) return;

    // Refresh subscriber memberships before dispatch so SSE mirrors live API access.
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
