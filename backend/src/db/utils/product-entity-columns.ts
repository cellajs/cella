import { bigint, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import type { ProductEntityType } from 'shared';
import { maxLength } from '#/db/utils/constraints';
import { tenantEntityColumns } from '#/db/utils/tenant-entity-columns';
import { usersTable } from '#/modules/user/user-db';
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
  createdBy: uuid().references(() => usersTable.id, { onDelete: 'set null' }),
  updatedBy: uuid().references(() => usersTable.id, { onDelete: 'set null' }),
  deletedAt: timestamp('deleted_at', { mode: 'string' }),
  deletedBy: uuid('deleted_by').references(() => usersTable.id, { onDelete: 'set null' }),
  /**
   * Public readability: non-null = readable by ANY actor, anonymous included, regardless of
   * membership. Only has effect when the entity declares `publicRead()` in
   * `shared/config/permissions-config.ts`; null (the default) keeps the mechanism dormant.
   *
   * Deliberately denormalized onto the row: the check-form, the collection-read SQL compiler,
   * and CDC stream dispatch must all reach the same verdict, and dispatch only ever ships the
   * row itself. A fork wanting "public because the parent is public" propagates `publicAt` to
   * descendants. Publication is data, not a permission rule.
   */
  publicAt: timestamp('public_at', { mode: 'string' }),
  /** Sequence number within (parent context, entityType) scope. Set by CDC worker, used for delta sync. */
  seq: bigint('seq', { mode: 'number' }).notNull().default(0),
});
