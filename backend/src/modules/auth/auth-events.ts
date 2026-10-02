import { EventEmitter } from 'node:events';
import type { SessionEndReason } from '#/modules/auth/sessions/sessions-db';

/** Auth lifecycle events for other modules; sessions are not CDC-tracked, so they cannot travel the activity bus. Handlers catch their own errors. */
export const authEvents = new EventEmitter<{
  /** Sessions revoked through `revokeSessions` (`all`: every session of the user), so their connections can close. */
  'session.revoked': [{ userId: string; sessionIds: string[] | 'all'; reason: SessionEndReason }];
}>();
