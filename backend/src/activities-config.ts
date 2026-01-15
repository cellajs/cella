import { membershipsTable } from './db/schema/memberships';
import { requestsTable } from './db/schema/requests';

/**
 * Resource types that are not entities but can have activities logged.
 * These are used when an activity is not directly related to an entity.
 */
/**
 * Define a mapping of resources and their tables
 */
export const resourceTables = {
  request: requestsTable,
  membership: membershipsTable,
} as const;

export const resourceTypes = ['request', 'membership'] as const;

export type ResourceTableNames = (typeof resourceTables)[keyof typeof resourceTables]['_']['name'];

export type ResourceType = (typeof resourceTypes)[number];

/**
 * Activity actions aligned with HTTP methods (excluding 'read').
 */
export const activityActions = ['create', 'update', 'delete'] as const;

export type ActivityAction = (typeof activityActions)[number];
