import { createStreamDispatcher } from '#/sync/stream';
import { canReceivePublicPageEvent } from './can-receive';
import { type PublicPageSubscriber, publicPageChannel } from './types';

/**
 * Dispatch page events to public page subscribers.
 */
export const dispatchToPublicPageSubscribers = createStreamDispatcher<PublicPageSubscriber>({
  getChannel: (event) => (event.entityType === 'page' ? publicPageChannel : null),
  shouldReceive: canReceivePublicPageEvent,
  logContext: 'public page',
});
