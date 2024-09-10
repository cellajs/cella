import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';
import { projectsTable } from './db/schema/projects';
import { projectsToWorkspacesTable } from './db/schema/projects-to-workspaces';
import { workspacesTable } from './db/schema/workspaces';

export type EntityTables = typeof usersTable | typeof organizationsTable | typeof workspacesTable | typeof projectsTable;

export type EntityTableNames = (typeof entityTables)[keyof typeof entityTables]['_']['name'];

export const entityTables = {
  user: usersTable,
  organization: organizationsTable,
  workspace: workspacesTable,
  project: projectsTable,
} as const;

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export const relationTables: { [key: string]: any } = {
  project: projectsToWorkspacesTable,
};

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
