import { isPublicStreamEntity } from 'shared';
import { createStreamDispatcher } from '#/sync/stream';
import { type PublicStreamSubscriber, publicChannel } from './types';

/**
 * Dispatch public entity events to subscribers.
 * Routes events to the appropriate public:{entityType} channel.
 */
export const dispatchToPublicSubscribers = createStreamDispatcher<PublicStreamSubscriber>({
  getChannel: (event) => {
    // Only route events for public product entity types
    if (!event.entityType) return null;
    if (!isPublicStreamEntity(event.entityType)) {
      return null;
    }
    return publicChannel(event.entityType);
  },
  shouldReceive: (_subscriber, event) => {
    // Subscriber should receive if entity type is public and has entity ID
    if (!event.entityType || !event.entityId) return false;
    return isPublicStreamEntity(event.entityType);
  },
  logContext: 'public entity',
});
