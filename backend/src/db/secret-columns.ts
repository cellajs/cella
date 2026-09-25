/**
 * Secret-bearing columns, by table name: the one declaration that three consumers derive from.
 * `createSelectSchema` (db/utils/drizzle-schema.ts) omits them from every response schema, the log
 * redaction list (lib/redact-keys.ts) censors them in backend and worker logs, and the CDC worker strips
 * them from the row image before it leaves the worker. A leaf module on purpose: nothing imported, so
 * every consumer can read it without a cycle.
 *
 * cdc/src/tests/secret-columns.test.ts fails when a column anywhere in the schema matches
 * `secretColumnPattern` and is listed in neither map, so a new secret column cannot reach the wire or
 * the logs by being forgotten.
 */
export const secretColumns = {
  api_keys: ['hash'],
  oauth_clients: ['secretHash'],
  passkey_challenges: ['challengeHash'],
  sessions: ['secret'],
  signing_keys: ['privateJwk'],
  tokens: ['secret', 'singleUseToken'],
  totps: ['secret'],
  unsubscribe_tokens: ['secret'],
} as const satisfies Record<string, readonly string[]>;

/**
 * Columns whose name matches the pattern but that hold no secret, so the test accepts them. Each with its
 * reason; move a column to `secretColumns` the moment the reason stops holding.
 */
export const secretLookingColumns = {
  // One-way identifiers that group a user's own sessions; the sessions list shows them.
  devices: ['deviceIdHash'],
  sessions: ['ipHash', 'ipSubnetHash', 'deviceIdHash'],
  // The DNS TXT value an admin must configure: shown on purpose.
  domains: ['verificationToken'],
  // The public half of the signing key, served on the JWKS endpoint.
  signing_keys: ['publicJwk'],
} as const satisfies Record<string, readonly string[]>;

/** A column name that ends like a stored secret. `tokenId` and `hashedAt` are references and stamps and do not match. */
export const secretColumnPattern = /(hash|secret|jwk|token|password)$/i;

export type SecretColumnTable = keyof typeof secretColumns;

/** The secret column names of a table, `never` for a table without any. */
export type SecretColumnsOf<TName extends string> = TName extends SecretColumnTable
  ? (typeof secretColumns)[TName][number]
  : never;

export const secretColumnsOf = (tableName: string): readonly string[] =>
  (secretColumns as Record<string, readonly string[]>)[tableName] ?? [];
