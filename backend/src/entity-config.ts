import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';
import type { ContextEntity } from './types/common';

export type EntityTables = (typeof entityTables)[keyof typeof entityTables];

export type EntityTableNames = EntityTables['_']['name'];

export type MenuSection = {
  name: string;
  entityType: ContextEntity;
  submenu?: {
    entityType: ContextEntity;
    parentField: 'organizationId';
  };
};
export type MenuSectionName = MenuSection['name'];

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
// Here you declare the menu sections
export const menuSections = [
  {
    name: 'organizations',
    entityType: 'organization',
  } as const,
];
