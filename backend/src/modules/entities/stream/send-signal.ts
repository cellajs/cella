import { type AppStreamSubscriber, accessDecisions, organizationSubscribers } from '#/modules/entities/helpers/dispatch-to-stream';
import type { Audience } from '#/modules/entities/stream/audiences';
import { sendToSubscribers } from '#/modules/entities/stream/helpers';
import { isDeclaredSignal } from '#/modules/entities/stream/signal-registry';
import { streamSubscriberManager, userTopic } from '#/modules/entities/stream/subscriber-manager';
import type { StreamSignal } from '#/schemas';
import { log } from '#/utils/logger';

/** The open streams an audience names. */
function audienceSubscribers(audience: Audience): AppStreamSubscriber[] {
  if (audience.kind === 'user') {
    // The user topic already targets the user; the filter is the safety net.
    return streamSubscriberManager
      .getByTopic<AppStreamSubscriber>(userTopic(audience.userId))
      .filter((subscriber) => subscriber.userId === audience.userId);
  }
  const { subject, action } = audience;
  const organizationId = subject.entityType === 'organization' ? subject.id : subject.channelIds.organization;
  if (!organizationId) return [];
  const subscribers = organizationSubscribers(organizationId);
  const decisions = accessDecisions(subscribers, action, subject);
  return subscribers.filter((_, index) => decisions[index]);
}

/**
 * Tells an audience's open streams that something changed, with ids only: the handler of `type` reads what it shows
 * through the API. Call it after the write it is about has committed, or a client may read the row before it exists.
 * Never throws: a type no module declared for this audience is logged and dropped, since the write it is about stands.
 * @param about - The organization and the one row the signal is about; leave `subjectId` out when it is about many.
 */
export async function sendSignal(
  type: string,
  audience: Audience,
  about: { organizationId?: string | null; subjectId?: string | null },
): Promise<void> {
  if (!isDeclaredSignal(type, audience.kind)) {
    log.error('Signal refused: no module declared this type for this audience', { type, audience: audience.kind });
    return;
  }
  const subscribers = audienceSubscribers(audience);
  if (subscribers.length === 0) return;

  const signal: StreamSignal = { type, organizationId: about.organizationId ?? null, subjectId: about.subjectId ?? null, version: null };
  await sendToSubscribers(subscribers, { event: 'signal', data: signal }, 'Failed to send stream signal');
}
