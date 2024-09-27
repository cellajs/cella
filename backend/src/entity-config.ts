import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';

export type EntityTables = (typeof entityTables)[keyof typeof entityTables];

export type EntityTableNames = EntityTables['_']['name'];

// Define what are the entities and their tables
export const entityTables = {
  user: usersTable,
  organization: organizationsTable,
} as const;

// Define how entities are renderd in user menu
export const entityMenuSections = [
  {
    storageType: 'organizations' as const,
    type: 'organization' as const,
    isSubmenu: false,
  },
];
