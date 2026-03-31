import { signCacheToken } from '#/middlewares/entity-cache/token-signer';
import { createStreamDispatcher } from '#/sync/stream/dispatcher';
import { canReceiveUserEvent } from './can-receive';
import { type AppStreamSubscriber, orgChannel } from './types';

/**
 * Dispatch activity events to matching user subscribers.
 * Uses createStreamDispatcher with cache token signing per subscriber.
 *
 * All events route through org channels:
 * - Membership events → org channel (filtered to affected user)
 * - Product entity events → org channel
 * - Organization events → org channel
 */
export const dispatchToUserSubscribers = createStreamDispatcher<AppStreamSubscriber>({
  getChannel: (event) => (event.organizationId ? orgChannel(event.organizationId) : null),
  shouldReceive: canReceiveUserEvent,
  transformNotification: (notification, subscriber) => {
    if (notification.cacheToken) {
      return { ...notification, cacheToken: signCacheToken(notification.cacheToken, subscriber.sessionToken) };
    }
    return notification;
  },
  logContext: 'app stream event',
});
