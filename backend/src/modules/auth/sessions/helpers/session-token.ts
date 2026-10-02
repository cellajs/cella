import { nanoid } from 'shared/utils/nanoid';
import { hashToken } from '#/utils/hash-token';

/** A fresh session token and the hash its row stores: the token itself exists only in the cookie. */
export const newSessionToken = () => {
  const token = nanoid(40);
  return { token, secret: hashToken(token) };
};
