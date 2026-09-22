import { getTableColumns } from 'drizzle-orm';
import { index, snakeCase, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import type { EntityScope } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { maxLength, tenantIdLength } from '#/db/utils/constraints';
import type { PrincipalId } from '#/db/utils/ids';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { principalsTable } from '#/modules/principals/principals-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';

/** `secret` keys authenticate a service account; `publishable` keys (later) identify a tenant and authorize nothing. */
export const credentialTypes = ['secret', 'publishable'] as const;
export type CredentialType = (typeof credentialTypes)[number];

/**
 * Opaque keys of a principal. Only the SHA-256 hash is stored; the plaintext is shown once at creation. A key may
 * only narrow what its principal can do (`scopes`), never widen it. Not under RLS: the machine guard looks a key up by
 * hash before it knows the tenant.
 */
export const credentialsTable = snakeCase.table(
  'credentials',
  {
    id: uuid().primaryKey().$defaultFn(generateId),
    principalId: uuid()
      .notNull()
      .references(() => principalsTable.id, { onDelete: 'cascade' })
      .$type<PrincipalId>(),
    tenantId: varchar({ length: tenantIdLength })
      .notNull()
      .references(() => tenantsTable.id, { onDelete: 'cascade' }),
    type: varchar({ enum: credentialTypes }).notNull().default('secret'),
    name: varchar({ length: maxLength.field }).notNull(),
    description: varchar({ length: maxLength.field }),
    /** The public part shown in the UI and logs: `<app>_sk_live_` plus the first characters of the secret. */
    prefix: varchar({ length: maxLength.field }).notNull(),
    hash: varchar({ length: maxLength.field }).notNull(),
    last4: varchar({ length: 4 }).notNull(),
    /** Mask over the principal's grants; null = unmasked. Values come from `scopes.all`. */
    scopes: varchar({ length: maxLength.field }).$type<EntityScope>().array(),
    expiresAt: timestamp({ mode: 'string' }),
    revokedAt: timestamp({ mode: 'string' }),
    lastUsedAt: timestamp({ mode: 'string' }),
    createdBy: uuid()
      .references(() => principalsTable.id, { onDelete: 'set null' })
      .$type<PrincipalId>(),
    createdAt: timestampColumns.createdAt,
  },
  (table) => [
    uniqueIndex('credentials_hash_idx').on(table.hash),
    index('credentials_principal_id_idx').on(table.principalId),
    index('credentials_tenant_id_idx').on(table.tenantId),
  ],
);

const { hash: _hash, ...safeColumns } = getTableColumns(credentialsTable);
/** Every column but the hash: what any response may carry. */
export const credentialSafeColumns = safeColumns;

/** Includes the hash; use only in the guard. */
export type UnsafeCredentialModel = typeof credentialsTable.$inferSelect;
export type InsertCredentialModel = typeof credentialsTable.$inferInsert;
export type CredentialModel = Omit<UnsafeCredentialModel, 'hash'>;
