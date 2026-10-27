import { secretColumns } from '#/db/secret-columns';

/** Keys that carry a secret in transit but are no column: provider tokens, PKCE, cookies' session token. */
const transportKeys = [
  'credentialId', // Passkey credentials
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'codeVerifier',
  'sessionToken',
  'nonce',
  'password',
];

/** Every secret column name plus the transport keys, deduplicated. Keep `code` visible: it is the WebSocket close code. */
const sensitiveLogKeys: string[] = [...new Set([...Object.values(secretColumns).flat(), ...transportKeys])];

/**
 * The pino redaction paths of every sensitive key, at the root and one level deep: fast-redact has no recursive
 * wildcard. This file reads no env, so the cdc and yjs workers import it without loading the backend env.
 */
export const redactPaths: string[] = sensitiveLogKeys.flatMap((key) => [key, `*.${key}`]);
