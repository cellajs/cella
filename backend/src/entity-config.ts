import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';

export type EntityTables = typeof usersTable | typeof organizationsTable;

export type EntityTableNames = typeof entityTables[keyof typeof entityTables]['_']['name'];

export const entityTables = {
  user: usersTable,
  organization: organizationsTable,
} as const;
