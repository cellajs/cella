import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '#/env';

export const generateUnsubscribeToken = (email: string) =>
  createHmac('sha256', env.UNSUBSCRIBE_SECRET).update(email, 'utf8').digest('hex');

/** Timing-safe comparison against the token derived from `email`. */
export const verifyUnsubscribeToken = (email: string, token: string) => {
  const expected = Buffer.from(generateUnsubscribeToken(email), 'utf8');
  const received = Buffer.from(token, 'utf8');
  // timingSafeEqual requires equal lengths.
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
};
