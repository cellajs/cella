import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';
import { attachmentsTable } from './db/schema/attachments';

/**
 * Define a mapping of entities and their tables
 */
export const entityTables = {
  user: usersTable,
  organization: organizationsTable,
  attachment: attachmentsTable,
} as const;

export type EntityTableNames = (typeof entityTables)[keyof typeof entityTables]['_']['name'];
