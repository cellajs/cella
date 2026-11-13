import { EventEmitter } from 'node:events';
import type { SessionRevocationReason } from '#/modules/auth/sessions/sessions-db';

/** Auth lifecycle events for other modules; sessions are not CDC-tracked, so they cannot travel the activity bus. Handlers catch their own errors. */
export const authEvents = new EventEmitter<{
  /**
   * Sessions that ended through `closeSessions` (`all`: every session of the user), so their connections can close:
   * revoked, or gone with their deleted user.
   */
  'session.revoked': [{ userId: string; sessionIds: string[] | 'all'; reason: SessionRevocationReason | 'user_deleted' }];
}>();
