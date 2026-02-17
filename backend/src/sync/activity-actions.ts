/**
 * Activity action types - shared between backend and CDC.
 *
 * Extracted to avoid CDC pulling in heavy OTel dependencies
 * through the activity-bus → sync-metrics → tracing chain.
 */

/** Activity actions aligned with HTTP methods (excluding 'read'). */
export const activityActions = ['create', 'update', 'delete'] as const;

export type ActivityAction = (typeof activityActions)[number];
