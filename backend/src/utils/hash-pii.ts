import { createHmac } from 'node:crypto';
import { env } from '#/env';

/**
 * Pseudonymizes normalized PII as a deterministic 64-bit HMAC identifier.
 * The server pepper resists offline lookup, while namespaces separate unrelated use sites.
 * Use only when the original value need not be recovered and the truncated-key collision
 * risk is acceptable; recoverable values require encryption.
 * @param value Raw value; blank input returns an empty string.
 * @param namespace Domain mixed into the HMAC.
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
