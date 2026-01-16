import { attachmentsTable } from '#/db/schema/attachments';
import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';
import { pagesTable } from './db/schema/pages';

/**
 * Define a mapping of entities and their tables
 */
export const entityTables = {
  user: usersTable,
  organization: organizationsTable,
  attachment: attachmentsTable,
  page: pagesTable,
} as const;

export type EntityTableNames = (typeof entityTables)[keyof typeof entityTables]['_']['name'];
