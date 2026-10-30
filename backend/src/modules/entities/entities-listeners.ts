import { appConfig } from 'shared';
import { activityBus, getEventData } from '#/lib/activity-bus';
import { cdcWebSocketServer } from '#/lib/cdc-websocket';
import { authEvents } from '#/modules/auth/auth-events';
import { type AppStreamSubscriber, dispatchChange, dispatchMoveOuts } from '#/modules/entities/helpers/dispatch-to-stream';
import { closeAppStreams, resyncAppStreams, streamErrorForEnding } from '#/modules/entities/helpers/session-streams';
import { toReaders, toUser } from '#/modules/entities/stream/audiences';
import { sendSignal } from '#/modules/entities/stream/send-signal';
import { streamSubscriberManager, userTopic } from '#/modules/entities/stream/subscriber-manager';
import type { AppStreamProductEvent } from '#/modules/entities/stream/types';
import { versionedSignals } from '#/modules/entities/stream/versioned-signals';
import { toMembershipBase } from '#/modules/memberships/helpers/select';
import { buildSubject } from '#/permissions/build-subject';
import { log } from '#/utils/logger';

// Activity bus listeners: product events reach authenticated SSE subscribers as changes, membership events as signals.
for (const entityType of appConfig.productEntityTypes) {
  for (const action of ['created', 'updated', 'deleted'] as const) {
    activityBus.on(`${entityType}.${action}`, async (event) => {
      if (!event.subjectId || !event.organizationId) return;
      try {
        // The bus carries product events with their rows, so the narrowing holds for every event of a product type.
        const productEvent = event as AppStreamProductEvent;
        // Reparented rows also tell old-path readers who lost visibility, side by side so a stalled reader delays neither.
        await Promise.all([dispatchChange(productEvent), action === 'updated' && dispatchMoveOuts(productEvent)]);
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
    .getByTopic<AppStreamSubscriber>(userTopic(userId))
    .filter((subscriber) => sessionIds === 'all' || sessionIds.includes(subscriber.sessionId))
    .map((subscriber) => ({ subscriber, payload }));
  await closeAppStreams(ended, 'Failed to close the stream of an ended session');
});

for (const action of ['created', 'updated', 'deleted'] as const) {
  activityBus.on(`membership.${action}`, async (event) => {
    if (!event.organizationId) return;

    // Refresh subscriber memberships before any signal so every later read decision mirrors live API access.
    const membership = getEventData(event, 'membership');
    if (!membership?.userId) return;
    const subscribers = streamSubscriberManager.getByTopic<AppStreamSubscriber>(userTopic(membership.userId));
    for (const subscriber of subscribers) {
      const remaining = subscriber.memberships.filter((existing) => existing.id !== membership.id);
      subscriber.memberships = action === 'deleted' ? remaining : [...remaining, toMembershipBase(membership)];
    }

    await sendSignal('membership.changed', toUser(membership.userId), { organizationId: event.organizationId, subjectId: membership.id });
  });
}

// The live half of a versioned signal: the organization's readers hear of it now, a client that misses it gets the version
// at catchup. Registered after the membership listeners, so a reader's memberships are current when it is decided.
for (const table of [...appConfig.entityTypes, ...appConfig.resourceTypes]) {
  const types = versionedSignals[table];
  if (!types) continue;
  for (const verb of ['created', 'updated', 'deleted'] as const) {
    activityBus.on(`${table}.${verb}`, async ({ organizationId }) => {
      if (!organizationId) return;
      const organization = buildSubject('organization', {}, { id: organizationId });
      for (const type of types) await sendSignal(type, toReaders(organization), { organizationId });
    });
  }
}

// The CDC worker corrected or rebuilt its books: cursors a client holds say nothing about them any more.
cdcWebSocketServer.onGenerationChange((generation) => {
  log.warn('The sync books moved to another generation: clients reconnect and refetch', { generation });
  void resyncAppStreams();
});
