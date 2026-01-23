import type { ProductEntityType } from 'config';
import { jsonb, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { baseEntityColumns } from '#/db/utils/base-entity-columns';

/**
 * Transaction metadata for sync tracking.
 * Written by handler, read by CDC Worker, overwritten on next mutation.
 */
export interface TxColumnData {
  /** Client-generated transaction ID (HLC format, max 32 chars) */
  transactionId: string;
  /** Tab/instance identifier (max 64 chars) */
  sourceId: string;
  /** Which field this mutation changes (null for create/delete) */
  changedField: string | null;
}

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
  tx: jsonb().$type<TxColumnData>(),
});
