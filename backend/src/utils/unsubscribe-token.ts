import { hmac } from '@oslojs/crypto/hmac';
import { SHA256 } from '@oslojs/crypto/sha2';
import { constantTimeEqual } from '@oslojs/crypto/subtle';
import { encodeHexLowerCase } from '@oslojs/encoding';
import { env } from '../env';

const secretKey = new TextEncoder().encode(env.UNSUBSCRIBE_SECRET);

/**
 * Generates an unsubscribe token for a given email.
 *
 * @param email - Email address for which to generate unsubscribe token.
 * @returns Unsubscribe token generated from the email.
 */
export const generateUnsubscribeToken = (email: string) => {
  const message = new TextEncoder().encode(email);
  return encodeHexLowerCase(hmac(SHA256, secretKey, message));
};

/**
 * Verifies if a given unsubscribe token matches the generated token for a specific email.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param email - Email address associated with unsubscribe request.
 * @param token - Token to verify against generated token.
 * @returns Boolean(if provided token matches, generated token).
 */
export const verifyUnsubscribeToken = (email: string, token: string) => {
  const expected = new TextEncoder().encode(generateUnsubscribeToken(email));
  const received = new TextEncoder().encode(token);
  // constantTimeEqual requires equal lengths - reject early if different
  if (expected.length !== received.length) return false;
  return constantTimeEqual(expected, received);
};
