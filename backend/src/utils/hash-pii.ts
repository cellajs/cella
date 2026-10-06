import { createHmac } from 'node:crypto';
import { modeSecret } from '#/env';

/** Bound to the user, so a table leak cannot correlate one IP across users. Backs MFA trust checks. */
export const hashIpForUser = (ip: string, userId: string): string => {
  if (!ip || !userId) return '';
  return createHmac('sha256', modeSecret('PII_HASH_SECRET')).update(`session:ip:${userId}:${ip}`).digest('hex').slice(0, 32);
};

/**
 * Bound to the user, so a table leak cannot correlate one device across users. Backs same-device session
 * grouping. The raw device id lives only in the signed httpOnly `device-id` cookie and is never persisted.
 */
export const hashDeviceIdForUser = (deviceId: string, userId: string): string => {
  if (!deviceId || !userId) return '';
  return createHmac('sha256', modeSecret('PII_HASH_SECRET')).update(`session:device:${userId}:${deviceId}`).digest('hex').slice(0, 32);
};

/** Global namespace, so one subnet always hashes the same and cross-user blocklist matching works. */
export const hashSubnet = (subnet: string): string => {
  if (!subnet) return '';
  return createHmac('sha256', modeSecret('PII_HASH_SECRET')).update(`blocklist:subnet:${subnet}`).digest('hex').slice(0, 32);
};

/** Global namespace per subject kind, so an IP or address counts in one bucket in every process; `rate_limits` holds the pseudonym alone. */
export const hashRateLimitSubject = (kind: 'ip' | 'email', value: string): string => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return '';
  return createHmac('sha256', modeSecret('PII_HASH_SECRET')).update(`ratelimit:${kind}:${normalized}`).digest('hex').slice(0, 32);
};
