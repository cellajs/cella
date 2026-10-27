import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { spendCookieToken } from '#/modules/auth/tokens/token-lifecycle';
import type { UserWithActivity } from '#/modules/user/helpers/select';
import { findUserById } from '#/modules/user/user-queries';

/**
 * Spends this browser's `oauth-connect` pin and returns the account it names: the one a provider or institution
 * connect goes to. Spent only while the session that issued it lives: a connect abandoned before a sign-out cannot be
 * finished.
 * @throws AppError 401 `oauth-connect_not_found` without a live pin, 404 `not_found` when its user is gone.
 */
export const spendConnectPin = async (ctx: Context<Env>): Promise<UserWithActivity> => {
  const pin = await spendCookieToken(ctx, 'oauth-connect');
  if (!pin?.userId || !pin.sessionId) throw new AppError(401, 'oauth-connect_not_found', 'warn');

  const user = await findUserById({ var: { db: baseDb } }, { id: pin.userId });
  if (!user) throw new AppError(404, 'not_found', 'error', { entityType: 'user' });
  return user;
};
