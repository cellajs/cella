import { z } from '@hono/zod-openapi';
import { compactVerify, createLocalJWKSet, decodeProtectedHeader, type JSONWebKeySet } from 'jose';
import { AppError } from '#/core/error';
import { guardedFetch } from '#/lib/guarded-fetch';
import type { LtiConnection } from '#/modules/connections/connections-db';

/** How long a platform's key set is trusted before it is read again: a key the platform withdrew stops working by then. */
const keySetMaxAgeMs = 60 * 60 * 1000;

/**
 * How long the last read answers every caller, an unknown key's included: a stranger's `kid` cannot make the app fetch
 * per request, and a failed read is not tried again before then.
 */
const lastReadAnswersMs = 30 * 1000;

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

/** The last key set read per connection and address, in this process, while in flight too: concurrent callers share it. */
const keySetReads = new Map<string, { read: Promise<JSONWebKeySet>; startedAt: number; failed: boolean }>();

const keySetUnavailable = (reason: string, connectionId: string) =>
  new AppError(400, 'outbound_request_failed', 'warn', { meta: { reason, connectionId } });

const fetchKeySet = async (connection: LtiConnection): Promise<JSONWebKeySet> => {
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
  return { keys: parsed.data.keys.flatMap((key) => rsaSigningKeySchema.safeParse(key).data ?? []) };
};

const readKeySet = (cacheKey: string, connection: LtiConnection) => {
  const entry = { read: fetchKeySet(connection), startedAt: Date.now(), failed: false };
  entry.read.catch(() => {
    entry.failed = true;
  });
  keySetReads.set(cacheKey, entry);
  return entry.read;
};

/** The connection's key set: the last read while it answers, a good one until old unless it misses the key, else a new read. */
const keySetFor = async (connection: LtiConnection, kid: string | undefined) => {
  const cacheKey = `${connection.id} ${connection.config.jwksUri}`;
  const last = keySetReads.get(cacheKey);
  const age = last ? Date.now() - last.startedAt : Number.POSITIVE_INFINITY;
  if (last && age < lastReadAnswersMs) return last.read;
  if (last && !last.failed && age < keySetMaxAgeMs) {
    const keySet = await last.read;
    if (!kid || keySet.keys.some((key) => key.kid === kid)) return keySet;
  }
  return readKeySet(cacheKey, connection);
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
