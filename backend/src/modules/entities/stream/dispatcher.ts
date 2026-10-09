import type { ActivityEvent } from '#/lib/activity-bus';
import { log } from '#/utils/logger';
import { buildStreamNotification } from './build-message';
import { sendNotificationToSubscriber } from './send-to-subscriber';
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

    // Every eligible subscriber receives the same notification, so it is serialized once.
    const notification = buildStreamNotification(event);
    const preSerialized = JSON.stringify(notification);

    await Promise.allSettled(
      eligible.map((subscriber) =>
        sendNotificationToSubscriber(subscriber, event, preSerialized).catch((error) => {
          log.error('Failed to dispatch stream event', { subscriberId: subscriber.id, activityId: event.id, channel, error });
        }),
      ),
    );
  };
}
