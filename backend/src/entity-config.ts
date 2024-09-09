import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';
import { projectsTable } from './db/schema/projects';
import { workspacesTable } from './db/schema/workspaces';

export type EntityTables = typeof usersTable | typeof organizationsTable | typeof workspacesTable | typeof projectsTable;

export const entityTables = new Map<string, EntityTables>([
  ['user', usersTable],
  ['organization', organizationsTable],
  ['workspace', workspacesTable],
  ['project', projectsTable],
]);
