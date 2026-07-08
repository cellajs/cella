import type { ActivityEvent } from '#/lib/activity-bus';
import { log } from '#/utils/logger';
import { buildStreamNotification } from './build-message';
import { sendNotificationToSubscriber } from './send-to-subscriber';
import { streamSubscriberManager } from './subscriber-manager';
import type { CursoredSubscriber, DispatcherConfig } from './types';

/**
 * Create a dispatcher function for a specific stream type.
 * Handles subscriber lookup by channel, filtering, and error handling.
 *
 * @example
 * const dispatchToOrgSubscribers = createStreamDispatcher<OrgStreamSubscriber>({
 *   getChannel: (event) => event.organizationId ? orgChannel(event.organizationId) : null,
 *   shouldReceive: canReceiveOrgEvent,
 * });
 */
export function createStreamDispatcher<T extends CursoredSubscriber, E extends ActivityEvent = ActivityEvent>(
  config: DispatcherConfig<T, E>,
): (event: E) => Promise<void> {
  const { getChannel, shouldReceive, transformNotification } = config;

  return async (event: E): Promise<void> => {
    const channel = getChannel(event);
    if (!channel) return;

    const subscribers = streamSubscriberManager.getByChannel<T>(channel);
    const eligible = subscribers.filter((s) => shouldReceive(s, event));
    if (eligible.length === 0) return;

    log.trace('Dispatching stream event', {
      activityId: event.id,
      action: event.action,
      subjectId: event.subjectId,
      channel,
      subscriberCount: eligible.length,
      hasRowData: !!event.rowData,
    });

    // Build notification once for all subscribers
    const notification = buildStreamNotification(event);
    // Pre-serialize when no per-subscriber transform is needed
    const preSerialized = !transformNotification ? JSON.stringify(notification) : undefined;

    await Promise.allSettled(
      eligible.map((subscriber) =>
        sendNotificationToSubscriber(subscriber, event, notification, transformNotification, preSerialized).catch(
          (error) => {
            log.error('Failed to dispatch stream event', {
              subscriberId: subscriber.id,
              activityId: event.id,
              channel,
              error,
            });
          },
        ),
      ),
    );
  };
}
