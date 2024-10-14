import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';
import { labelsTable } from './db/schema/labels';
import { projectsTable } from './db/schema/projects';
import { tasksTable } from './db/schema/tasks';
import { workspacesTable } from './db/schema/workspaces';

export type EntityTables = (typeof entityTables)[keyof typeof entityTables];

export type EntityTableNames = EntityTables['_']['name'];

export type MenuSection = (typeof menuSections)[number];
export type MenuSectionName = MenuSection['name'];

// Define what are the entities and their tables
export const entityTables = {
  user: usersTable,
  organization: organizationsTable,
  workspace: workspacesTable,
  project: projectsTable,
  label: labelsTable,
  task: tasksTable,
} as const;

export const entityIdFields = {
  user: 'userId',
  organization: 'organizationId',
  workspace: 'workspaceId',
  project: 'projectId',
  label: 'labelId',
  task: 'taskId',
} as const;

// Define how entities are rendered in user menu
// Here you declare the menu sections
export const menuSections = [
  {
    name: 'organizations',
    entityType: 'organization',
  } as const,
  {
    name: 'workspaces',
    entityType: 'workspace',
    submenu: {
      name: 'projects',
      entityType: 'project',
      parentField: 'workspaceId',
    } as const,
  } as const,
];