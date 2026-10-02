import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { finishSignIn } from '#/modules/auth/general/helpers/finish-sign-in';
import type { TokenRecord } from '#/modules/auth/tokens/tokens-queries';
import { markEmailVerified } from '#/modules/user/operations/email-proof';
import { findUserById } from '#/modules/user/user-queries';
import { log } from '#/utils/logger';

/** The sign-in reads and stamps on the base pool, whatever the route's context holds. */
const dbCtx = { var: { db: baseDb } };

/** Signs in the user a redeemed magic link names, and records that the click proved their inbox. */
export const handleMagicLink = async (ctx: Context<Env>, token: TokenRecord) => {
  if (!token.userId) throw new AppError(500, 'server_error', 'error');

  const user = await findUserById(dbCtx, { id: token.userId });
  if (!user) throw new AppError(404, 'not_found', 'error', { entityType: 'user', meta: { userId: token.userId } });

  // Clicking a magic link proves email ownership. Sign-in is the point here, so a missing row is logged, not fatal.
  if (token.email) {
    const verified = await markEmailVerified(dbCtx, { userId: user.id, email: token.email, via: 'magic' });
    if (!verified) log.error('Magic link address is not on the account', { userId: user.id });
  }

  return finishSignIn(ctx, user, 'magic', token.redirectPath);
};
