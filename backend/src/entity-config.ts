import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';

export type EntityTables = typeof usersTable | typeof organizationsTable;

export const entityTables = new Map<string, EntityTables>([
  ['user', usersTable],
  ['organization', organizationsTable],
]);