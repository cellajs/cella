import { createHmac } from 'node:crypto';
import { Argon2id } from 'oslo/password';
import { env } from '../../env';

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

export const hashPasswordWithArgon = async (password: string) => {
  const secret = new TextEncoder().encode(env.ARGON_SECRET);
  const argon2id = new Argon2id({ secret });
  return await argon2id.hash(password);
};

export const verifyPasswordWithArgon = async (hashedPassword: string, password: string) => {
  const secret = new TextEncoder().encode(env.ARGON_SECRET);
  const argon2id = new Argon2id({ secret });
  return await argon2id.verify(hashedPassword, password);
};
