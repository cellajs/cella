import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';

export type EntityTables = (typeof entityTables)[keyof typeof entityTables];

export type EntityTableNames = EntityTables['_']['name'];

export type StorageType = (typeof entityMenuSections)[number]['storageType'];

// Define what are the entities and their tables
export const entityTables = {
  user: usersTable,
  organization: organizationsTable,
} as const;

export const entityIdFields = {
  user: 'userId',
  organization: 'organizationId',
} as const;

// Define how entities are rendered in user menu
export const entityMenuSections = [
  {
    storageType: 'organizations' as const,
    type: 'organization' as const,
    isSubmenu: false,
  },
];

// Expose unique storage types for menu schema
export const uniqueStorageTypes = Array.from(new Set(entityMenuSections.map((section) => section.storageType)));
