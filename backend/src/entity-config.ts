import type { ContextEntity } from 'config';
import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';
import { attachmentsTable } from './db/schema/attachments';

export type EntityTableNames = (typeof entityTables)[keyof typeof entityTables]['_']['name'];

export type ContextEntityIdFields = {
  [K in keyof typeof entityIdFields]: K extends ContextEntity ? (typeof entityIdFields)[K] : never;
}[keyof typeof entityIdFields];

export type MenuSection = {
  name: (typeof menuSections)[number]['name'];
  entityType: ContextEntity;
  submenu?: {
    entityType: ContextEntity;
    parentField: ContextEntityIdFields;
  };
};

export type MenuSectionName = MenuSection['name'];

// Define entities and their tables
export const entityTables = {
  user: usersTable,
  organization: organizationsTable,
  attachment: attachmentsTable,
} as const;

// Define fields to identify an entity
export const entityIdFields = {
  user: 'userId',
  organization: 'organizationId',
  attachment: 'attachmentId',
} as const;

// Define entities in user menu
// Supports submenus by adding a submenu property
// ie. submenu: { name: 'workspaces', entityType: 'workspace', parentField: 'organizationId' }
export const menuSections = [
  {
    name: 'organizations',
    entityType: 'organization',
  } as const,
];
