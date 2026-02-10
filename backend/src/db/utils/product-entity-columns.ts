import { varchar } from 'drizzle-orm/pg-core';
import type { ProductEntityType } from 'shared';
import { usersTable } from '#/db/schema/users';
import { tenantEntityColumns } from '#/db/utils/tenant-entity-columns';
import { stxColumns } from './stx-columns';

/**
 * Creates base columns shared by all product entities.
 * Extends tenantEntityColumns with stx sync metadata, keywords, and audit fields.
 */
export const productEntityColumns = <T extends ProductEntityType>(entityType: T) => ({
  ...tenantEntityColumns(entityType),
  name: varchar().notNull().default(`New ${entityType}`), // Override default name
  // Sync: transient transaction metadata
  ...stxColumns,
  // Keywords from description
  keywords: varchar().notNull(),
  // Audit fields
  createdBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
  modifiedBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
});
