import { EventEmitter } from 'node:events';

/** Auth lifecycle events for other modules; sessions are not CDC-tracked, so they cannot travel the activity bus. Handlers catch their own errors. */
export const authEvents = new EventEmitter<{
  /** Sessions ended by sign-out or termination, so connections bound to them can be closed. */
  'session.deleted': [{ userId: string; sessionIds: string[] }];
}>();
