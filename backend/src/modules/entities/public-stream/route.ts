/**
 * Dispatch logic for public entity stream.
 * Entity-agnostic: uses config.publicProductEntityTypes dynamically.
 */

import { appConfig, type PublicProductEntityType } from 'config';
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
    if (!appConfig.publicProductEntityTypes.includes(event.entityType as PublicProductEntityType)) {
      return null;
    }
    return publicChannel(event.entityType);
  },
  shouldReceive: (_subscriber, event) => {
    // Subscriber should receive if entity type is public and has entity ID
    if (!event.entityType || !event.entityId) return false;
    return appConfig.publicProductEntityTypes.includes(event.entityType as PublicProductEntityType);
  },
  logContext: 'public entity',
});
