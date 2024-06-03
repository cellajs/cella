import { organizationsTable } from '../db/schema/organizations';
import { projectsTable } from '../db/schema/projects';
import { usersTable } from '../db/schema/users';
import { workspacesTable } from '../db/schema/workspaces';

// Create a map to store tables for different resource types
export const entityTables = new Map<string, typeof organizationsTable | typeof workspacesTable | typeof projectsTable | typeof usersTable>([
  ['ORGANIZATION', organizationsTable],
  ['WORKSPACE', workspacesTable],
  ['PROJECT', projectsTable],
  ['USER', usersTable],
]);
