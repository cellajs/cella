import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';
import { attachmentsTable } from './db/schema/attachments';
import type { ContextEntity } from './types/common';

export type EntityTables = (typeof entityTables)[keyof typeof entityTables];

export type EntityTableNames = EntityTables['_']['name'];

// TODO this type is a bit redundant, but it was added to make submenus work while not using it in cella directly.
export type MenuSection = {
  name: 'organizations';
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
  attachment: attachmentsTable,
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
