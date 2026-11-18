import { z } from '@hono/zod-openapi';
import { compactVerify, createLocalJWKSet, decodeProtectedHeader, type JSONWebKeySet } from 'jose';
import { AppError } from '#/core/error';
import { guardedFetch } from '#/lib/guarded-fetch';
import type { LtiConnection } from '#/modules/connections/connections-db';

/** How long a platform's key set is trusted before it is read again: a key the platform withdrew stops working by then. */
const keySetMaxAgeMs = 60 * 60 * 1000;

/** The youngest cached set a token naming an unknown key reads again: a stranger's `kid` cannot make the app fetch per request. */
const unknownKeyRefetchAfterMs = 30 * 1000;

const keySetSchema = z.object({ keys: z.array(z.unknown()).max(100) });

/** The members of an RSA signing key that RS256 verification reads; a key of another type cannot verify a launch and is left out. */
const rsaSigningKeySchema = z.object({
  kty: z.literal('RSA'),
  n: z.string().max(4096),
  e: z.string().max(16),
  kid: z.string().max(1024).optional(),
  alg: z.literal('RS256').optional(),
  use: z.literal('sig').optional(),
});

/** Key sets per connection and address, in this process. */
const keySets = new Map<string, { keySet: JSONWebKeySet; fetchedAt: number }>();

const keySetUnavailable = (reason: string, connectionId: string) =>
  new AppError(400, 'outbound_request_failed', 'warn', { meta: { reason, connectionId } });

const fetchKeySet = async (cacheKey: string, connection: LtiConnection) => {
  const response = await guardedFetch(connection.config.jwksUri, { headers: { Accept: 'application/json' } });
  if (response.status !== 200) throw keySetUnavailable('key_set_status', connection.id);
  let body: unknown;
  try {
    body = JSON.parse(response.text);
  } catch {
    throw keySetUnavailable('key_set_json', connection.id);
  }
  const parsed = keySetSchema.safeParse(body);
  if (!parsed.success) throw keySetUnavailable('key_set_members', connection.id);
  const keySet: JSONWebKeySet = { keys: parsed.data.keys.flatMap((key) => rsaSigningKeySchema.safeParse(key).data ?? []) };
  keySets.set(cacheKey, { keySet, fetchedAt: Date.now() });
  return keySet;
};

/** The connection's key set: cached, read again when old, or once on a key it does not hold. */
const keySetFor = async (connection: LtiConnection, kid: string | undefined) => {
  const cacheKey = `${connection.id} ${connection.config.jwksUri}`;
  const cached = keySets.get(cacheKey);
  const age = cached ? Date.now() - cached.fetchedAt : Number.POSITIVE_INFINITY;
  if (!cached || age > keySetMaxAgeMs) return fetchKeySet(cacheKey, connection);
  const knowsKey = !kid || cached.keySet.keys.some((key) => key.kid === kid);
  return knowsKey || age < unknownKeyRefetchAfterMs ? cached.keySet : fetchKeySet(cacheKey, connection);
};

/**
 * Whether the platform of `connection` signed `token`, with RS256 and a key of the set its configuration named. The
 * set comes through the guarded fetch.
 * @returns False for a signature, algorithm or key that fails.
 * @throws AppError 400 `outbound_request_failed` when the key set cannot be read, and what `guardedFetch` throws.
 */
export const isSignedByPlatform = async (token: string, connection: LtiConnection): Promise<boolean> => {
  const keySet = await keySetFor(connection, decodeProtectedHeader(token).kid);
  return compactVerify(token, createLocalJWKSet(keySet), { algorithms: ['RS256'] }).then(
    () => true,
    () => false,
  );
};
