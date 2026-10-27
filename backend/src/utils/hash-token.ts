import { createHash } from 'node:crypto';
import { nanoid } from 'shared/utils/nanoid';

/** SHA-256 lowercase hex. The output must stay stable: these hashes are persisted for sessions and tokens. */
export const hashToken = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');

/**
 * A fresh random bearer value (a session token, a link's raw value, a redeemed link's single-use value) and the
 * {@link hashToken} hash its row stores: the raw value exists only in the cookie or link that carries it.
 */
export const newHashedToken = () => {
  const raw = nanoid(40);
  return { raw, hash: hashToken(raw) };
};
