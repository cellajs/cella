import { index, jsonb, snakeCase, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { maxLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';

/** `next` is published before it signs anything; `current` signs; `retired` still verifies until its last token expires. */
export const signingKeyStatuses = ['next', 'current', 'retired'] as const;

/**
 * The keystore: RS256 keypairs that sign the tokens this app issues (OAuth access tokens; later LTI launches and client
 * assertions). The private JWK is encrypted at rest with `data-encryption.ts`; the public JWK is what the JWKS
 * endpoint and the in-process verifier publish. Rotation moves next → current → retired.
 */
export const signingKeysTable = snakeCase.table(
  'signing_keys',
  {
    /** The `kid` in every token header. */
    id: varchar({ length: maxLength.field }).primaryKey(),
    alg: varchar({ length: 16 }).notNull().default('RS256'),
    status: varchar({ enum: signingKeyStatuses }).notNull(),
    privateJwk: text().notNull(),
    publicJwk: jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: timestampColumns.createdAt,
    retiredAt: timestamp({ mode: 'string' }),
  },
  (table) => [index('signing_keys_status_idx').on(table.status)],
);

export type SigningKeyModel = typeof signingKeysTable.$inferSelect;
