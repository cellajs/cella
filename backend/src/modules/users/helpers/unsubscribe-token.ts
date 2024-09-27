import { createHmac } from 'node:crypto';
import { env } from '../../../../env';

const secretKey = env.UNSUBSCRIBE_TOKEN_SECRET;

export const generateUnsubscribeToken = (email: string) => {
  const hmac = createHmac('sha256', secretKey);
  hmac.update(email);
  return hmac.digest('hex');
};

export const verifyUnsubscribeToken = (email: string, token: string) => {
  const generatedToken = generateUnsubscribeToken(email);
  return generatedToken === token;
};
