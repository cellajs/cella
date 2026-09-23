import { getTableColumns } from 'drizzle-orm';
import { index, snakeCase, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import type { AccessScope } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import type { ActorId } from '#/db/utils/ids';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { actorsTable } from '#/modules/actors/actors-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';

/**
 * Opaque keys of an actor. Only the SHA-256 hash is stored; the plaintext is shown once at creation. A key may
 * only narrow what its actor can do (`scopes`), never widen it. Not under RLS: the machine guard looks a key up by
 * hash before it knows the tenant.
 */
export const apiKeysTable = snakeCase.table(
  'api_keys',
  {
    id: uuid().primaryKey().$defaultFn(generateId),
    actorId: uuid()
      .notNull()
      .references(() => actorsTable.id, { onDelete: 'cascade' })
      .$type<ActorId>(),
    tenantId: varchar({ length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id, { onDelete: 'cascade' }),
    name: varchar({ length: maxLength.field }).notNull(),
    /** The public part shown in the UI and logs: `<app>_sk_live_` plus the first characters of the secret. */
    prefix: varchar({ length: maxLength.field }).notNull(),
    hash: varchar({ length: maxLength.field }).notNull(),
    last4: varchar({ length: 4 }).notNull(),
    /** Mask over the actor's bindings; null = unmasked. Values come from `accessScopes.all`. */
    scopes: varchar({ length: maxLength.field }).$type<AccessScope>().array(),
    expiresAt: timestamp({ mode: 'string' }),
    revokedAt: timestamp({ mode: 'string' }),
    revokedBy: uuid()
      .references(() => actorsTable.id, { onDelete: 'set null' })
      .$type<ActorId>(),
    createdBy: uuid()
      .references(() => actorsTable.id, { onDelete: 'set null' })
      .$type<ActorId>(),
    createdAt: timestampColumns.createdAt,
  },
  (table) => [
    uniqueIndex('api_keys_hash_idx').on(table.hash),
    index('api_keys_actor_id_idx').on(table.actorId),
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
