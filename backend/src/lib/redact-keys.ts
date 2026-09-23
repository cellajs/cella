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
export const sensitiveLogKeys: string[] = [...new Set([...Object.values(secretColumns).flat(), ...transportKeys])];

// fast-redact lacks recursive wildcards, so sensitive keys are listed at root and one level deep. Env-free on purpose,
// so the cdc and yjs workers can import it without loading the backend env.
export const redactedFields: string[] = sensitiveLogKeys.flatMap((key) => [key, `*.${key}`]);
