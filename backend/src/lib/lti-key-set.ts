import { z } from '@hono/zod-openapi';
import type { JSONWebKeySet } from 'jose';
import { AppError } from '#/core/error';
import { guardedFetch } from '#/lib/guarded-fetch';

/** How long a key set is trusted before it is read again: a key its owner withdrew stops working by then. */
const keySetMaxAgeMs = 60 * 60 * 1000;

/**
 * How long the last read answers a key the last good set lacks: a stranger's `kid` cannot make the app fetch per
 * request, and a failed read is not tried again before then.
 */
const lastReadAnswersMs = 30 * 1000;

const keySetSchema = z.object({ keys: z.array(z.unknown()).max(100) });

/** The members of an RSA signing key that RS256 verification reads; a key of another type cannot verify and is left out. */
const rsaSigningKeySchema = z.object({
  kty: z.literal('RSA'),
  n: z.string().max(4096),
  e: z.string().max(16),
  kid: z.string().max(1024).optional(),
  alg: z.literal('RS256').optional(),
  use: z.literal('sig').optional(),
});

/** The other side of an LTI connection whose key set the app reads: a platform's connection, or an LTI tool's registration. */
export interface LtiKeySetOwner {
  /** The connection or registration id: each address of it is cached apart. */
  id: string;
  jwksUri: string;
  /** What a refused read names in its error, such as `{ connectionId }`. */
  meta: Record<string, string>;
}

/** An owner's last set read whole, and its last read, in flight or settled, which concurrent callers share. */
type KeySetState = { good?: { keySet: JSONWebKeySet; readAt: number }; read?: { promise: Promise<JSONWebKeySet>; startedAt: number } };

/** Per owner and address, in this process. */
const keySets = new Map<string, KeySetState>();

const keySetUnavailable = (reason: string, owner: LtiKeySetOwner) =>
  new AppError(400, 'outbound_request_failed', 'warn', { meta: { reason, ...owner.meta } });

const fetchKeySet = async (owner: LtiKeySetOwner): Promise<JSONWebKeySet> => {
  const response = await guardedFetch(owner.jwksUri, { headers: { Accept: 'application/json' } });
  if (response.status !== 200) throw keySetUnavailable('key_set_status', owner);
  let body: unknown;
  try {
    body = JSON.parse(response.text);
  } catch {
    throw keySetUnavailable('key_set_json', owner);
  }
  const parsed = keySetSchema.safeParse(body);
  if (!parsed.success) throw keySetUnavailable('key_set_members', owner);
  return { keys: parsed.data.keys.flatMap((key) => rsaSigningKeySchema.safeParse(key).data ?? []) };
};

/**
 * The RS256 keys of the set an LTI connection's other side published, read through the guarded fetch: the last good
 * set while it holds the key `kid` names and is not old, else the last read while it answers, else a new read. A read
 * in flight or failed never replaces a good set.
 * @throws AppError 400 `outbound_request_failed` when the key set cannot be read, and what `guardedFetch` throws.
 */
export const readLtiKeySet = async (owner: LtiKeySetOwner, kid: string | undefined): Promise<JSONWebKeySet> => {
  const cacheKey = `${owner.id} ${owner.jwksUri}`;
  const state = keySets.get(cacheKey) ?? {};
  keySets.set(cacheKey, state);
  const { good, read } = state;
  const now = Date.now();
  if (good && now - good.readAt < keySetMaxAgeMs && (!kid || good.keySet.keys.some((key) => key.kid === kid))) return good.keySet;
  if (read && now - read.startedAt < lastReadAnswersMs) return read.promise;

  const promise = fetchKeySet(owner).then((keySet) => {
    state.good = { keySet, readAt: now };
    return keySet;
  });
  state.read = { promise, startedAt: now };
  return promise;
};
