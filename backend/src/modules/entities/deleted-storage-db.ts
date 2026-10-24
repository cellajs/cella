import { bigint, jsonb, snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { tenantIdLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';

/**
 * What a deleted entity row held outside its own table, written by the statement-level delete trigger every entity
 * table carries (the deletion-queue side effect), whatever deleted the row: a request, an FK cascade, a hand-written
 * `DELETE` or `apply_retention()`. The cleanup job deletes the stored files and retires the collaborative documents,
 * then the row. Outside RLS and outside the CDC publication.
 */
export const deletedStorageTable = snakeCase.table('deleted_storage', {
  id: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
  entityType: varchar({ length: 50 }).notNull(),
  entityId: uuid().notNull(),
  /** Null for a user, which belongs to no tenant. */
  tenantId: varchar({ length: tenantIdLength }),
  /** The organization the row belonged to; the row's own id for an organization, null for a user. */
  organizationId: uuid(),
  /** The row's storage columns (`storage-columns.ts`) as it held them. */
  storage: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestampColumns.createdAt,
});

export type DeletedStorageModel = typeof deletedStorageTable.$inferSelect;
