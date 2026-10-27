import type { TimeSpan } from '#/utils/time-span';

/** ISO 8601, e.g. "2025-02-18T12:34:56.789Z". */
export const getIsoDate = () => new Date().toISOString();

/** The ISO 8601 moment `timeSpan` from now, such as an expiry. */
export const isoDateIn = (timeSpan: TimeSpan) => new Date(Date.now() + timeSpan.milliseconds()).toISOString();

/** The ISO 8601 moment `timeSpan` ago, such as the start of a window. */
export const isoDateAgo = (timeSpan: TimeSpan) => new Date(Date.now() - timeSpan.milliseconds()).toISOString();
