import { createStreamDispatcher } from '#/sync/stream';
import { type PublicPageSubscriber, publicPageChannel } from './types';

/**
 * Dispatch page events to public page subscribers.
 */
export const dispatchToPublicPageSubscribers = createStreamDispatcher<PublicPageSubscriber>({
  getChannel: (event) => (event.entityType === 'page' ? publicPageChannel : null),
  shouldReceive: (_subscriber, event) => event.entityType === 'page' && !!event.entityId,
  logContext: 'public page',
});
