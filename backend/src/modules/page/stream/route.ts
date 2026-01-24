import { createStreamDispatcher } from '#/sync/stream';
import { shouldReceivePublicPageEvent } from './should-receive';
import { type PublicPageSubscriber, publicPageIndexKey } from './types';

/**
 * Dispatch page events to public page subscribers.
 */
export const dispatchToPublicPageSubscribers = createStreamDispatcher<PublicPageSubscriber>({
  getIndexKey: (event) => (event.entityType === 'page' ? publicPageIndexKey : null),
  shouldReceive: shouldReceivePublicPageEvent,
  logContext: 'public page',
});
