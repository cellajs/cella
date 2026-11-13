import {
  actionToVerb,
  activityActions,
  appConfig,
  buildSubject,
  buildSubjectFromEntity,
  type EntityType,
  hierarchy,
  type ResourceType,
} from 'shared';
import { type ActivityEvent, activityBus, getEventData } from '#/lib/activity-bus';
import { authEvents } from '#/modules/auth/auth-events';
import { dispatchChange, dispatchMoveOuts } from '#/modules/entities/helpers/dispatch-to-stream';
import { closeStreamsWhere } from '#/modules/entities/helpers/session-streams';
import { type Audience, toReaders, toUser } from '#/modules/entities/stream/audiences';
import { sendSignal } from '#/modules/entities/stream/send-signal';
import { streamSubscriberManager, userTopic } from '#/modules/entities/stream/subscriber-manager';
import type { StreamProductEvent } from '#/modules/entities/stream/types';
import { versionedSignalsOf } from '#/modules/entities/stream/versioned-signals';
import { toMembershipBase } from '#/modules/memberships/helpers/select';
import { log } from '#/utils/logger';

// Activity bus listeners: product events reach authenticated SSE subscribers as changes, membership events as signals.
for (const entityType of appConfig.productEntityTypes) {
  for (const action of ['created', 'updated', 'deleted'] as const) {
    activityBus.on(`${entityType}.${action}`, async (event) => {
      try {
        const productEvent: StreamProductEvent = event;
        // Reparented rows also tell old-path readers who lost visibility, side by side so a stalled reader delays neither.
        await Promise.all([dispatchChange(productEvent), action === 'updated' && dispatchMoveOuts(productEvent)]);
      } catch (error) {
        log.error('Failed to dispatch entity change event', { error, activityIds: event.rows.map((row) => row.activityId) });
      }
    });
  }
}

// Closes the streams bound to ended sessions, each with the code that tells the client whether to reconnect.
authEvents.on('session.revoked', async ({ userId, sessionIds, reason }) => {
  await closeStreamsWhere(
    (subscriber) => subscriber.userId === userId && (sessionIds === 'all' || sessionIds.includes(subscriber.sessionId)),
    reason,
  );
});

for (const action of ['created', 'updated', 'deleted'] as const) {
  activityBus.on(`membership.${action}`, async (event) => {
    if (!event.organizationId) return;

    // Refresh subscriber memberships before any signal so every later read decision mirrors live API access.
    const membership = getEventData(event, 'membership');
    if (!membership?.userId) return;
    const subscribers = streamSubscriberManager.getByTopic(userTopic(membership.userId));
    for (const subscriber of subscribers) {
      const remaining = subscriber.memberships.filter((existing) => existing.id !== membership.id);
      subscriber.memberships = action === 'deleted' ? remaining : [...remaining, toMembershipBase(membership)];
    }

    await sendSignal('membership.changed', toUser(membership.userId), { organizationId: event.organizationId, subjectId: membership.id });
  });
}

// The live half of a versioned signal: its audience hears of it now, a client that misses it gets the version at catchup.
// Registered after the membership listeners, so a reader's memberships are current when it is decided.
for (const table of [...appConfig.entityTypes, ...appConfig.resourceTypes]) {
  for (const action of activityActions) {
    const signals = versionedSignalsOf(table, action);
    if (signals.length === 0) continue;
    activityBus.on(`${table}.${actionToVerb(action)}`, async (event) => {
      const { organizationId } = event;
      if (!organizationId) return;
      const organization = buildSubject('organization', {}, { id: organizationId });
      const channel = namedChannel(event, table);
      const versions = event.rows === null ? event.signalVersions : undefined;
      for (const { type, namesRow } of signals) {
        const version = versions?.[type];
        if (!namesRow) await sendSignal(type, toReaders(organization), { organizationId, version });
        else if (channel) await sendSignal(type, channel.readers, { organizationId, subjectId: channel.id, version });
      }
    });
  }
}

/** The channel row an event is about and the readers of it, who alone may learn of it; null for any other row, fail-closed. */
function namedChannel(event: ActivityEvent, table: EntityType | ResourceType): { id: string; readers: Audience } | null {
  if (event.rows !== null || !hierarchy.isChannel(table)) return null;
  const channel = getEventData(event, table);
  if (!channel) return null;
  try {
    return { id: channel.id, readers: toReaders(buildSubjectFromEntity(table, channel)) };
  } catch {
    log.error('Malformed channel event: missing ancestor scope', { entityType: table, subjectId: channel.id });
    return null;
  }
}
