import { createHmac } from 'node:crypto';
import { nanoid } from 'shared/utils/nanoid';
import { serviceSecret } from '#/env';

/**
 * HMAC-SHA-256 under `DATA_HASH_SECRET` as 64 lowercase hex characters: a row written with the hash of a value of its
 * writer's choosing matches no presented token. Sessions, API keys and links store this hash, and a new secret value
 * ends every one of them.
 */
export const hashToken = (token: string): string =>
  createHmac('sha256', serviceSecret('DATA_HASH_SECRET')).update(`token\n${token}`, 'utf8').digest('hex');

/**
 * A fresh random bearer value (a session token, a link's raw value, a redeemed link's single-use value) and the
 * {@link hashToken} hash its row stores: the raw value exists only in the cookie or link that carries it.
 */
export const newHashedToken = () => {
  const raw = nanoid(40);
  return { raw, hash: hashToken(raw) };
};
