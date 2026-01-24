import { createStreamDispatcher } from '#/sync/stream';
import { shouldReceiveOrgEvent } from './should-receive';
import { type OrgStreamSubscriber, orgIndexKey } from './types';

/**
 * Dispatch activity events to matching org subscribers.
 */
export const dispatchToOrgSubscribers = createStreamDispatcher<OrgStreamSubscriber>({
  getIndexKey: (event) => (event.organizationId ? orgIndexKey(event.organizationId) : null),
  shouldReceive: shouldReceiveOrgEvent,
  logContext: 'org event',
});
