import type { ProductEntityType } from 'config';
import { varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { baseEntityColumns } from '#/db/utils/base-entity-columns';
import { txColumns } from '#/db/utils/tx-columns';

// Re-export for backward compatibility
export type { TxColumnData } from '#/db/utils/tx-columns';

/**
 * Creates base columns shared by all product entities.
 */
export const productEntityColumns = <T extends ProductEntityType>(entityType: T) => ({
  ...baseEntityColumns(entityType),
  name: varchar().notNull().default(`New ${entityType}`), // Override default name
  // Keywords from description
  keywords: varchar().notNull(),
  // Audit fields
  createdBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
  modifiedBy: varchar().references(() => usersTable.id, { onDelete: 'set null' }),
  // Sync: transient transaction metadata (overwritten on each mutation)
  ...txColumns,
});
