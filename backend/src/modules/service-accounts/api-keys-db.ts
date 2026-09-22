import { getTableColumns } from 'drizzle-orm';
import { index, snakeCase, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import type { AccessScope } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import type { PrincipalId } from '#/db/utils/ids';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { principalsTable } from '#/modules/principals/principals-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';

/**
 * Opaque keys of a principal. Only the SHA-256 hash is stored; the plaintext is shown once at creation. A key may
 * only narrow what its principal can do (`scopes`), never widen it. Not under RLS: the machine guard looks a key up by
 * hash before it knows the tenant.
 */
export const apiKeysTable = snakeCase.table(
  'api_keys',
  {
    id: uuid().primaryKey().$defaultFn(generateId),
    principalId: uuid()
      .notNull()
      .references(() => principalsTable.id, { onDelete: 'cascade' })
      .$type<PrincipalId>(),
    tenantId: varchar({ length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id, { onDelete: 'cascade' }),
    name: varchar({ length: maxLength.field }).notNull(),
    /** The public part shown in the UI and logs: `<app>_sk_live_` plus the first characters of the secret. */
    prefix: varchar({ length: maxLength.field }).notNull(),
    hash: varchar({ length: maxLength.field }).notNull(),
    last4: varchar({ length: 4 }).notNull(),
    /** Mask over the principal's grants; null = unmasked. Values come from `accessScopes.all`. */
    scopes: varchar({ length: maxLength.field }).$type<AccessScope>().array(),
    expiresAt: timestamp({ mode: 'string' }),
    revokedAt: timestamp({ mode: 'string' }),
    revokedBy: uuid()
      .references(() => principalsTable.id, { onDelete: 'set null' })
      .$type<PrincipalId>(),
    createdBy: uuid()
      .references(() => principalsTable.id, { onDelete: 'set null' })
      .$type<PrincipalId>(),
    createdAt: timestampColumns.createdAt,
  },
  (table) => [
    uniqueIndex('api_keys_hash_idx').on(table.hash),
    index('api_keys_principal_id_idx').on(table.principalId),
    index('api_keys_tenant_id_idx').on(table.tenantId),
  ],
);

const { hash: _hash, ...safeColumns } = getTableColumns(apiKeysTable);
/** Every column but the hash: what any response may carry. */
export const apiKeySafeColumns = safeColumns;

/** Includes the hash; use only in the guard. */
export type UnsafeApiKeyModel = typeof apiKeysTable.$inferSelect;
export type InsertApiKeyModel = typeof apiKeysTable.$inferInsert;
export type ApiKeyModel = Omit<UnsafeApiKeyModel, 'hash'>;
