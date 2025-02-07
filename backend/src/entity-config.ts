import type { ContextEntity } from 'config';
import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';
import { attachmentsTable } from './db/schema/attachments';

/**
 * Configuration
 */

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

export const entityRelations = [
  {
    menuSectionName: 'organizations',
    entity: 'organization',
  } as const,
] satisfies UsageEntityRelations[];

/**
 * Usage  Types
 */

type EntityWithSubEntity = {
  subEntity: ContextEntity; // When subEntity is ContextEntity
  dependentHierarchy: boolean; // dependentHierarchy is required
};

type EntityWithoutSubEntity = {
  subEntity?: undefined; // subEntity is absent
  dependentHierarchy?: never; // dependentHierarchy must not be present
};

type UsageEntityRelations = {
  menuSectionName: string;
  entity: ContextEntity;
} & (EntityWithSubEntity | EntityWithoutSubEntity);

/**
 * Export Types
 */

export type EntityTableNames = (typeof entityTables)[keyof typeof entityTables]['_']['name'];

export type ContextEntityIdFields = {
  [K in keyof typeof entityIdFields]: K extends ContextEntity ? (typeof entityIdFields)[K] : never;
}[keyof typeof entityIdFields];

export type EntityRelations = Omit<UsageEntityRelations, 'menuSectionName'> & {
  menuSectionName: (typeof entityRelations)[number]['menuSectionName'];
};

export type MenuSectionName = EntityRelations['menuSectionName'];
