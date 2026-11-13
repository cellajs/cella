import { jsonb, snakeCase, text, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { JWK } from 'jose';
import { maxLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';

/** `next` is published before it signs anything; `current` signs. */
const signingKeyStatuses = ['next', 'current'] as const;

/**
 * The keystore: RS256 keypairs that sign the tokens this app issues (OAuth access tokens). The private JWK is encrypted
 * at rest with `data-encryption.ts`; the public JWK is what the JWKS endpoint and the in-process verifier publish.
 */
export const signingKeysTable = snakeCase.table(
  'signing_keys',
  {
    /** The `kid` in every token header. */
    id: varchar({ length: maxLength.field }).primaryKey(),
    alg: varchar({ length: 16 }).notNull().default('RS256'),
    status: varchar({ enum: signingKeyStatuses }).notNull(),
    privateJwk: text().notNull(),
    publicJwk: jsonb().$type<JWK>().notNull(),
    createdAt: timestampColumns.createdAt,
  },
  (table) => [
    // One signer and one successor at a time, whatever races at first boot or during a rollout.
    uniqueIndex('signing_keys_one_per_status_idx').on(table.status),
  ],
);

export type SigningKeyModel = typeof signingKeysTable.$inferSelect;
