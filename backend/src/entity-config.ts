import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';
import { labelsTable } from './db/schema/labels';
import { projectsTable } from './db/schema/projects';
import { tasksTable } from './db/schema/tasks';
import { workspacesTable } from './db/schema/workspaces';

export type EntityTables = (typeof entityTables)[keyof typeof entityTables];

export type EntityTableNames = EntityTables['_']['name'];

export const entityTables = {
  user: usersTable,
  organization: organizationsTable,
  workspace: workspacesTable,
  project: projectsTable,
  label: labelsTable,
  task: tasksTable,
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
