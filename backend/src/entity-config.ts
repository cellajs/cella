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

  ──────────────────────────────────────────────────────────────────────────────
  ⚠️  IMPORTANT:
  If you define a `subEntity`, that in relation to main entity, then corresponding database table for that
  sub-entity, must include a foreign key, field named `${entity}Id`.

  Example:
  If a `group` is a subEntity of `team`, then `group` table must include: teamId: references 'teams' table

  This is required for , generating memberships logic and building UI.

  ──────────────────────────────────────────────────────────────────────────────
  Configuration Fields:
  - `menuSectionName`: Label used in navigation menus
  - `entity`: The parent entity (e.g., 'project', 'team')
  - `subEntity`: The child entity (optional). If defined, the child must have a foreign key `${entity}Id`.

  Examples:
  1. Standalone entity:
      {
        menuSectionName: 'departments',
        entity: 'department'
      }

  2. Sub-entity:
      {
        menuSectionName: 'teams',
        entity: 'team',
        subEntity: 'defender',
      } or {
        menuSectionName: 'teams',
        entity: 'team',
        subEntity: 'forward',
      }
*/
export const entityRelations = [
  {
    menuSectionName: 'organizations', // Name of menu section
    entity: 'organization',
    subEntity: undefined,
  } as const,
] satisfies UsageEntityRelations[];

type UsageEntityRelations = {
  menuSectionName: string;
  entity: ContextEntity;
  subEntity?: ContextEntity;
};

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
