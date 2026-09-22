import { snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import { timestampColumns } from '#/db/utils/timestamp-columns';

/** Who can act and be named in provenance: a human user today, a service account later. */
export const principalKinds = ['user', 'service'] as const;
export type PrincipalKind = (typeof principalKinds)[number];

/**
 * Supertable of actors. `users.id` (and later `service_accounts.id`) is a foreign key to this id, so `createdBy` /
 * `updatedBy` / `deletedBy` on content can reference any actor kind with one real constraint. Holds nothing but the
 * discriminator: every other fact lives on the kind's own table.
 */
export const principalsTable = snakeCase.table('principals', {
  id: uuid().primaryKey().$defaultFn(generateId),
  kind: varchar({ enum: principalKinds }).notNull(),
  createdAt: timestampColumns.createdAt,
});

export type PrincipalModel = typeof principalsTable.$inferSelect;
export type InsertPrincipalModel = typeof principalsTable.$inferInsert;
