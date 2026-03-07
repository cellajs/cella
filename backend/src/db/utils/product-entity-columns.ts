import { bigint, varchar } from 'drizzle-orm/pg-core';
import type { ProductEntityType } from 'shared';
import { usersTable } from '#/db/schema/users';
import { maxLength } from '#/db/utils/constraints';
import { tenantEntityColumns } from '#/db/utils/tenant-entity-columns';
import { stxColumns } from './stx-columns';

/**
 * Creates base columns shared by all product entities.
 */
export const productEntityColumns = <T extends ProductEntityType>(entityType: T) => ({
  ...tenantEntityColumns(entityType),
  name: varchar({ length: maxLength.field }).notNull().default(`New ${entityType}`), // Override default name
  ...stxColumns,
  description: varchar({ length: maxLength.html }).default(''),
  keywords: varchar({ length: maxLength.html }).notNull().default(''),
  createdBy: varchar({ length: maxLength.id }).references(() => usersTable.id, { onDelete: 'set null' }),
  modifiedBy: varchar({ length: maxLength.id }).references(() => usersTable.id, { onDelete: 'set null' }),
  /** Sequence number within (parent context, entityType) scope. Set by DB trigger (`stamp_entity_seq_at`), used for delta sync. */
  seqAt: bigint('seq_at', { mode: 'number' }).notNull().default(0),
});
