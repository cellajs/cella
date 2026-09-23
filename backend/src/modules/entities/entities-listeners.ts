import { appConfig } from 'shared';
import { activityBus, getEventData } from '#/lib/activity-bus';
import { authEvents } from '#/modules/auth/auth-events';
import {
  type AppStreamSubscriber,
  dispatchMoveOuts,
  dispatchToAppStream,
} from '#/modules/entities/helpers/dispatch-to-stream';
import { toMembershipBase } from '#/modules/memberships/helpers/select';
import { log } from '#/utils/logger';
import { streamSubscriberManager, writeError } from './stream';
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

// Closes the streams bound to a revoked session; without this they stay live until the client reconnects.
// The client treats the `unauthorized` code as permanent and opens its circuit.
authEvents.on('session.revoked', async ({ userId, sessionIds }) => {
  const subscribers = streamSubscriberManager.getByChannel<AppStreamSubscriber>(`user:${userId}`);
  for (const subscriber of subscribers) {
    if (!sessionIds.includes(subscriber.sessionId)) continue;
    await writeError(subscriber.stream, { code: 'unauthorized', message: 'Session revoked' });
    streamSubscriberManager.unregister(subscriber.id);
    // Abort runs the handler's onAbort cleanup and ends the response body; close lets keepAlive return.
    subscriber.stream.abort();
    await subscriber.stream.close();
  }
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
