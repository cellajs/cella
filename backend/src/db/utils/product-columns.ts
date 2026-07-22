import { bigint, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import type { ProductEntityType } from 'shared';
import { maxLength } from '#/db/utils/constraints';
import { productPathColumn } from '#/db/utils/path-column';
import { tenantEntityColumns } from '#/db/utils/tenant-entity-columns';
import { usersTable } from '#/modules/user/user-db';
import { stxColumns } from './stx-columns';

/**
 * Creates base columns shared by all product entities.
 */
export const productColumns = <T extends ProductEntityType>(entityType: T) => ({
  ...tenantEntityColumns(entityType),
  name: varchar({ length: maxLength.field }).notNull().default(`New ${entityType}`), // Override default name
  ...stxColumns,
  description: varchar({ length: maxLength.html }).default(''),
  keywords: varchar({ length: maxLength.html }).notNull().default(''),
  createdBy: uuid().references(() => usersTable.id, { onDelete: 'set null' }),
  updatedBy: uuid().references(() => usersTable.id, { onDelete: 'set null' }),
  deletedAt: timestamp('deleted_at', { mode: 'string' }),
  deletedBy: uuid('deleted_by').references(() => usersTable.id, { onDelete: 'set null' }),
  /**
   * Enables actor-independent reads when the entity declares `publicRead()`.
   * Keeping publication on the row lets permission checks, SQL, and stream dispatch reach the
   * same decision; parent publication must be propagated as data.
   */
  publicAt: timestamp('public_at', { mode: 'string' }),
  /**
   * Org sequence: one totally-ordered counter per organization, shared across all
   * product entity types. Stamped post-commit by the CDC worker (WAL commit order = sequence
   * order); rows briefly hold the default 0 until stamped. Used for delta sync (`seqCursor`).
   */
  seq: bigint('seq', { mode: 'number' }).notNull().default(0),
  ...productPathColumn(entityType),
});
