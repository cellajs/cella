import { snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { generateId } from 'shared/utils/entity-id';
import { timestampColumns } from '#/db/utils/timestamp-columns';

/** Who can act and be named in provenance: a human user, or a service account behind an API key. */
export const principalKinds = ['user', 'service'] as const;
export type PrincipalKind = (typeof principalKinds)[number];

/**
 * Supertable of actors. `users.id` and `service_accounts.id` are foreign keys to this id, so `createdBy` /
 * `updatedBy` / `deletedBy` on content reference any actor kind with one real constraint. Holds nothing but the
 * discriminator: every other fact lives on the kind's own table. Rows are written by `insertPrincipals`
 * (helpers/insert-principals.ts), always in the same transaction as the kind's row.
 */
export const principalsTable = snakeCase.table('principals', {
  id: uuid().primaryKey().$defaultFn(generateId),
  kind: varchar({ enum: principalKinds }).notNull(),
  createdAt: timestampColumns.createdAt,
});
