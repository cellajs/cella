import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';

export type EntityTables = (typeof entityTables)[keyof typeof entityTables];

export type EntityTableNames = EntityTables['_']['name'];

export const entityTables = {
  user: usersTable,
  organization: organizationsTable,
} as const;

export const entityMenuSections = [
  {
    storageType: 'organizations' as const,
    type: 'organization' as const,
    isSubmenu: false,
  },
];
