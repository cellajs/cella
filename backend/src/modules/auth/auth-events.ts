import { EventEmitter } from 'node:events';

/** Auth lifecycle events for other modules; sessions are not CDC-tracked, so they cannot travel the activity bus. Handlers catch their own errors. */
export const authEvents = new EventEmitter<{
  /** Sessions revoked by a sign-out or from another session, so connections bound to them can be closed. */
  'session.revoked': [{ userId: string; sessionIds: string[] }];
}>();
