import { appConfig } from './config-builder/app-config.ts';

/**
 * How far back an entity counts as unseen: the activity window, which also bounds the seen marks. One source for the
 * server's `findUnseenCountsByUser` predicate and client-side unseen tracking, which mirror each other row for row: a
 * divergent window miscounts badges with no error anywhere.
 */
export const seenWindowMs = appConfig.retention.activityDays * 24 * 60 * 60 * 1000;
