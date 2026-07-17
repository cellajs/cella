import { createHmac } from 'node:crypto';
import { env } from '#/env';

/**
 * One-way pseudonymize a PII value (e.g. email) into a stable, opaque key.
 *
 * Uses HMAC-SHA256 with `PII_HASH_SECRET` as a server-side pepper, then truncates
 * to 16 hex chars (64 bits), collision-resistant enough for lookup buckets while
 * keeping keys short for storage and logs.
 *
 * Use this for any PII that is stored or logged purely as a key (rate-limit
 * buckets, audit event subjects, analytics dimensions). Do NOT use this where
 * the original value must be recoverable. Use encryption for recoverable values.
 *
 * Properties:
 * - Deterministic: same input always produces the same output (good for keying).
 * - Pepper-protected: leak of the DB/logs alone does not allow reversal via
 *   precomputed rainbow tables. The pepper must stay secret on the server.
 * - Normalized: input is trimmed and lowercased so `Foo@Bar.com` and
 *   ` foo@bar.com ` collide to the same bucket.
 *
 * @param value Raw PII value to hash. Empty/whitespace-only input returns ''.
 * @param namespace Optional logical namespace mixed into the HMAC to enforce
 *   cryptographic domain separation between unrelated use sites (e.g. 'email',
 *   'audit:email'). Recommended for any new use site.
 */
export const hashPii = (value: string, namespace = 'pii'): string => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return '';
  return createHmac('sha256', env.PII_HASH_SECRET).update(`${namespace}:${normalized}`).digest('hex').slice(0, 16);
};

/**
 * Hash an IP address bound to a specific user. Different users with the same IP
 * produce different hashes, preventing cross-user IP correlation if the table leaks.
 * Used for "have I seen this IP for this user before?" checks (MFA trust).
 */
export const hashIpForUser = (ip: string, userId: string): string => {
  if (!ip || !userId) return '';
  return createHmac('sha256', env.PII_HASH_SECRET).update(`session:ip:${userId}:${ip}`).digest('hex').slice(0, 32);
};

/**
 * Hash a device id bound to a specific user. Different users on the same physical device produce
 * different hashes, preventing cross-user device correlation if the table leaks. Used for "have I
 * seen this device for this user?" checks and same-device session grouping/replacement. The raw
 * device id lives only in the signed, httpOnly `device-id` cookie and is never persisted.
 */
export const hashDeviceIdForUser = (deviceId: string, userId: string): string => {
  if (!deviceId || !userId) return '';
  return createHmac('sha256', env.PII_HASH_SECRET)
    .update(`session:device:${userId}:${deviceId}`)
    .digest('hex')
    .slice(0, 32);
};

/**
 * Hash a network subnet (IPv4 /24 or IPv6 /48) with a global namespace so the
 * same subnet always produces the same hash. Used for cross-user blocklist
 * matching. This differs from `hashIpForUser` by design.
 */
export const hashSubnet = (subnet: string): string => {
  if (!subnet) return '';
  return createHmac('sha256', env.PII_HASH_SECRET).update(`blocklist:subnet:${subnet}`).digest('hex').slice(0, 32);
};
