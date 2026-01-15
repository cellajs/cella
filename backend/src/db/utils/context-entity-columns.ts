import type { ContextEntityType } from 'config';
import { varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { baseEntityColumns } from '#/db/utils/base-entity-columns';

/**
 * Creates base columns shared by all context entities.
 * Extends baseEntityColumns with slug, thumbnailUrl, bannerUrl, and audit fields.
 */
export const contextEntityColumns = <T extends ContextEntityType>(entityType: T) => ({
  ...baseEntityColumns(entityType),
  slug: varchar().unique().notNull(),
  thumbnailUrl: varchar(),
  bannerUrl: varchar(),
  // Audit fields
  createdBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
  modifiedBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
});
