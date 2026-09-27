import { createHmac } from 'node:crypto';
import { safeEqual } from 'shared/utils/safe-equal';
import { modeSecret } from '#/env';
import { hashToken } from '#/utils/hash-token';

/** The token an unsubscribe link carries for an address; only its hash is stored (`unsubscribeTokenRow`). */
export const generateUnsubscribeToken = (email: string) =>
  createHmac('sha256', modeSecret('UNSUBSCRIBE_SECRET')).update(email, 'utf8').digest('hex');

/**
 * The `unsubscribe_tokens` row for a user's address: the token's SHA-256, never the token, so a read of the table opens
 * no link. `findUserByUnsubscribeToken` looks a presented token up by the same hash.
 */
export const unsubscribeTokenRow = (userId: string, email: string) => ({
  userId,
  secret: hashToken(generateUnsubscribeToken(email)),
});

/** Timing-safe comparison against the token derived from `email`. */
export const verifyUnsubscribeToken = (email: string, token: string) =>
  safeEqual(token, generateUnsubscribeToken(email));
