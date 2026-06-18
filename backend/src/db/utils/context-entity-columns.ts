import { uuid, varchar } from 'drizzle-orm/pg-core';
import type { ContextEntityType } from 'shared';
import { maxLength } from '#/db/utils/constraints';
import { tenantEntityColumns } from '#/db/utils/tenant-entity-columns';
import { usersTable } from '#/modules/user/user-db';

/**
 * Creates base columns shared by all context entities.
 */
export const contextEntityColumns = <T extends ContextEntityType>(entityType: T) => ({
  ...tenantEntityColumns(entityType),
  slug: varchar({ length: maxLength.field }).unique().notNull(),
  thumbnailUrl: varchar({ length: maxLength.url }),
  bannerUrl: varchar({ length: maxLength.url }),
  createdBy: uuid().references(() => usersTable.id, { onDelete: 'set null' }),
  updatedBy: uuid().references(() => usersTable.id, { onDelete: 'set null' }),
});
