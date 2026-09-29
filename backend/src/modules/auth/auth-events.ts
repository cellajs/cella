import { EventEmitter } from 'node:events';
import type { SessionEndReason } from '#/modules/auth/sessions-db';

/** Auth lifecycle events for other modules; sessions are not CDC-tracked, so they cannot travel the activity bus. Handlers catch their own errors. */
export const authEvents = new EventEmitter<{
  /** Sessions ended through `endSessions` (`all`: every session of the user), so connections bound to them can be closed. */
  'session.revoked': [{ userId: string; sessionIds: string[] | 'all'; reason: SessionEndReason }];
}>();
