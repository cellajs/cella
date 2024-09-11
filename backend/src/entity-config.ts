import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';
import { projectsTable } from './db/schema/projects';
import { workspacesTable } from './db/schema/workspaces';

export type EntityTables = typeof usersTable | typeof organizationsTable | typeof workspacesTable | typeof projectsTable;

export type EntityTableNames = (typeof entityTables)[keyof typeof entityTables]['_']['name'];

export const entityTables = {
  user: usersTable,
  organization: organizationsTable,
  workspace: workspacesTable,
  project: projectsTable,
} as const;

export const entityMenuSections = [
  {
    storageType: 'organizations' as const,
    type: 'organization' as const,
    isSubmenu: false,
  },
  {
    storageType: 'workspaces' as const,
    type: 'workspace' as const,
    isSubmenu: false,
  },
  {
    storageType: 'workspaces' as const,
    type: 'project' as const,
    isSubmenu: true,
  },
];
