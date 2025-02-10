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

/*
  Define entity relationships.
  This configuration also helps in creating user menu.

  - `subEntity` must be one of `ContextEntityTypes` if used.
  - `dependentHierarchy` is required when `subEntity` is set. It determines whether membership should be connected through associated  entity.
  - For sub-entities, ensure that database schema includes a column `${entity}Id` (e.g., `projectId`, `teamId`) that references associated `entity`.

  Example configuration:
  1. Base config - {
    menuSectionName: 'departments',
    entity: 'department'
  }.
  2. Submenu without hierarchy - {
    menuSectionName: 'projects',
    entity: 'project',
    subEntity: 'task',                 
    dependentHierarchy: false // No hierarchy needed between project and task
  }.
  3. Submenu with hierarchy - {
    menuSectionName: 'teams',
    entity: 'team',
    subEntity: 'defender',
    dependentHierarchy: true // Hierarchical relationship between team and defender role
  } or {
    menuSectionName: 'teams',
    entity: 'team',
    subEntity: 'forward',
    dependentHierarchy: true // Hierarchical relationship between team and forward role
  }
*/
export const entityRelations = [
  {
    menuSectionName: 'organizations', // Name of menu section
    entity: 'organization',
    subEntity: undefined,
    dependentHierarchy: undefined, // Indicates that the sub-entity requires a hierarchy dependency
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
