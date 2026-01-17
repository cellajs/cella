import { getTableName } from 'drizzle-orm';
import { attachmentsTable } from '#/db/schema/attachments';
import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';
import { membershipsTable } from './db/schema/memberships';
import { pagesTable } from './db/schema/pages';
import { requestsTable } from './db/schema/requests';

export type EntityTableName = (typeof entityTableNames)[number];

export type ResourceTableName = (typeof resourceTableNames)[number];

export type ResourceType = (typeof resourceTypes)[number];

/**
 * Define a mapping of entities and their tables
 */
export const entityTables = {
  user: usersTable,
  organization: organizationsTable,
  attachment: attachmentsTable,
  page: pagesTable,
} as const;

/**
 * Resource types that are not entities but have activities logged.
 */
export const resourceTypes = ['request', 'membership'] as const;

/**
 * Define a mapping of resources and their tables
 */
export const resourceTables = {
  request: requestsTable,
  membership: membershipsTable,
} as const;

/** Table names derived from entity tables */
export const entityTableNames = Object.values(entityTables).map((t) => getTableName(t));

/** Table names derived from resource tables */
export const resourceTableNames = Object.values(resourceTables).map((t) => getTableName(t));

/** Combined table names for activity/cdc */
export const activityTableNames = [...entityTableNames, ...resourceTableNames];
