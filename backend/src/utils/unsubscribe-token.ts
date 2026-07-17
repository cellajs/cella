import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '#/env';

/**
 * Generates an unsubscribe token for a given email.
 *
 * @param email - Email address for which to generate unsubscribe token.
 * @returns Unsubscribe token generated from the email.
 */
export const generateUnsubscribeToken = (email: string) =>
  createHmac('sha256', env.UNSUBSCRIBE_SECRET).update(email, 'utf8').digest('hex');

/**
 * Verifies an unsubscribe token against the one derived from `email`, using a
 * timing-safe comparison to prevent timing attacks.
 */
export const verifyUnsubscribeToken = (email: string, token: string) => {
  const expected = Buffer.from(generateUnsubscribeToken(email), 'utf8');
  const received = Buffer.from(token, 'utf8');
  // timingSafeEqual requires equal lengths - reject early if different
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
};
