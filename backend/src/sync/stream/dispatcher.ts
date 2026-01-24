import type { ActivityEventWithEntity } from '#/sync/activity-bus';
import { logEvent } from '#/utils/logger';
import type { CursoredSubscriber } from './send-to-subscriber';
import { sendToSubscriber } from './send-to-subscriber';
import { streamSubscriberManager } from './subscriber-manager';

/**
 * Configuration for creating a stream dispatcher.
 */
export interface DispatcherConfig<T extends CursoredSubscriber> {
  /** Get index key from event (return null to skip dispatch) */
  getIndexKey: (event: ActivityEventWithEntity) => string | null;
  /** Filter function to check if subscriber should receive event */
  shouldReceive: (subscriber: T, event: ActivityEventWithEntity) => boolean;
  /** Context name for logging (e.g., 'org event', 'public page') */
  logContext: string;
}

/**
 * Create a dispatcher function for a specific stream type.
 * Handles subscriber lookup, filtering, and error handling.
 *
 * @example
 * const dispatchToOrgSubscribers = createStreamDispatcher<OrgStreamSubscriber>({
 *   getIndexKey: (event) => event.organizationId ? orgIndexKey(event.organizationId) : null,
 *   shouldReceive: shouldReceiveOrgEvent,
 *   logContext: 'org event',
 * });
 */
export function createStreamDispatcher<T extends CursoredSubscriber>(
  config: DispatcherConfig<T>,
): (event: ActivityEventWithEntity) => Promise<void> {
  const { getIndexKey, shouldReceive, logContext } = config;

  return async (event: ActivityEventWithEntity): Promise<void> => {
    const indexKey = getIndexKey(event);
    if (!indexKey) return;

    const subscribers = streamSubscriberManager.getByIndex<T>(indexKey);

    logEvent('debug', `Dispatching ${logContext}`, {
      activityId: event.id,
      action: event.action,
      entityId: event.entityId,
      indexKey,
      subscriberCount: subscribers.length,
      hasEntityData: !!event.entity,
    });

    for (const subscriber of subscribers) {
      if (shouldReceive(subscriber, event)) {
        try {
          await sendToSubscriber(subscriber, event);
        } catch (error) {
          logEvent('error', `Failed to dispatch ${logContext}`, {
            subscriberId: subscriber.id,
            activityId: event.id,
            error,
          });
        }
      }
    }
  };
}
