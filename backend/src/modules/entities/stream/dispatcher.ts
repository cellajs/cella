import type { ActivityEvent } from '#/lib/activity-bus';
import { log } from '#/utils/logger';
import { buildStreamNotification } from './build-message';
import { sendToSubscribers } from './helpers';
import { streamSubscriberManager } from './subscriber-manager';
import type { BaseStreamSubscriber, DispatcherConfig } from './types';

export function createStreamDispatcher<T extends BaseStreamSubscriber, E extends ActivityEvent = ActivityEvent>(
  config: DispatcherConfig<T, E>,
): (event: E) => Promise<void> {
  const { getChannel, selectEligible } = config;

  return async (event: E): Promise<void> => {
    const channel = getChannel(event);
    if (!channel) return;

    const subscribers = streamSubscriberManager.getByChannel<T>(channel);
    const eligible = subscribers.length ? selectEligible(subscribers, event) : subscribers;
    if (eligible.length === 0) return;

    log.trace('Dispatching stream event', {
      activityId: event.id,
      action: event.action,
      subjectId: event.subjectId,
      channel,
      subscriberCount: eligible.length,
    });

    await sendToSubscribers(eligible, event, buildStreamNotification(event), 'Failed to dispatch stream event');
  };
}
