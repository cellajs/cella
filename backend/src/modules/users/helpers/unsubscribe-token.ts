import { createHmac } from 'node:crypto';
import { env } from '../../../../env';

const secretKey = env.UNSUBSCRIBE_TOKEN_SECRET;

/**
 * Generates an unsubscribe token for a given email.
 *
 *
 * @param email - Email address for which to generate unsubscribe token.
 * @returns Unsubscribe token generated from the email.
 */
export const generateUnsubscribeToken = (email: string) => {
  const hmac = createHmac('sha256', secretKey);
  hmac.update(email);
  return hmac.digest('hex');
};

/**
 * Verifies if a given unsubscribe token matches the generated token for a specific email.
 *
 * @param email - Email address associated with unsubscribe request.
 * @param token - Token to verify against generated token.
 * @returns Boolean(if provided token matches, generated token).
 */
export const verifyUnsubscribeToken = (email: string, token: string) => {
  const generatedToken = generateUnsubscribeToken(email);
  return generatedToken === token;
};
