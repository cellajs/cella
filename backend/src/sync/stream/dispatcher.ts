import type { StreamNotification } from '#/schemas';
import type { ActivityEventWithEntity } from '#/sync/activity-bus';
import { logEvent } from '#/utils/logger';
import { buildStreamNotification } from './build-message';
import type { CursoredSubscriber } from './send-to-subscriber';
import { sendNotificationToSubscriber } from './send-to-subscriber';
import { streamSubscriberManager } from './subscriber-manager';

/**
 * Configuration for creating a stream dispatcher.
 */
export interface DispatcherConfig<T extends CursoredSubscriber> {
  /** Get channel from event (return null to skip dispatch) */
  getChannel: (event: ActivityEventWithEntity) => string | null;
  /** Filter function to check if subscriber should receive event */
  shouldReceive: (subscriber: T, event: ActivityEventWithEntity) => boolean;
  /** Optional: transform notification before sending (e.g., sign cache token per subscriber) */
  transformNotification?: (notification: StreamNotification, subscriber: T) => StreamNotification;
  /** Context name for logging (e.g., 'org event', 'public page') */
  logContext: string;
}

/**
 * Create a dispatcher function for a specific stream type.
 * Handles subscriber lookup by channel, filtering, and error handling.
 *
 * @example
 * const dispatchToOrgSubscribers = createStreamDispatcher<OrgStreamSubscriber>({
 *   getChannel: (event) => event.organizationId ? orgChannel(event.organizationId) : null,
 *   shouldReceive: canReceiveOrgEvent,
 *   logContext: 'org event',
 * });
 */
export function createStreamDispatcher<T extends CursoredSubscriber>(
  config: DispatcherConfig<T>,
): (event: ActivityEventWithEntity) => Promise<void> {
  const { getChannel, shouldReceive, transformNotification, logContext } = config;

  return async (event: ActivityEventWithEntity): Promise<void> => {
    const channel = getChannel(event);
    if (!channel) return;

    const subscribers = streamSubscriberManager.getByChannel<T>(channel);
    const eligible = subscribers.filter((s) => shouldReceive(s, event));
    if (eligible.length === 0) return;

    logEvent(null, 'trace', `Dispatching ${logContext}`, {
      activityId: event.id,
      action: event.action,
      entityId: event.entityId,
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
            logEvent(null, 'error', `Failed to dispatch ${logContext}`, {
              subscriberId: subscriber.id,
              activityId: event.id,
              error,
            });
          },
        ),
      ),
    );
  };
}
