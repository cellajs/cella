import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { finishSignIn } from '#/modules/auth/general/helpers/finish-sign-in';
import { markEmailVerified } from '#/modules/auth/general/helpers/mark-email-verified';
import type { TokenModel } from '#/modules/auth/tokens-db';
import { userSelect } from '#/modules/user/helpers/select';
import { usersTable } from '#/modules/user/user-db';
import { log } from '#/utils/logger';

export const handleMagicLink = async (ctx: Context<Env>, token: TokenModel) => {
  if (!token.userId) throw new AppError(500, 'server_error', 'error');

  const [user] = await db.select(userSelect).from(usersTable).where(eq(usersTable.id, token.userId)).limit(1);
  if (!user) throw new AppError(404, 'not_found', 'error', { entityType: 'user', meta: { userId: token.userId } });

  // Clicking a magic link proves email ownership. Sign-in is the point here, so a missing row is logged, not fatal.
  if (token.email) {
    const verified = await markEmailVerified(db, { userId: user.id, email: token.email });
    if (!verified) log.error('Magic link address is not on the account', { userId: user.id });
  }

  return finishSignIn(ctx, user, 'magic', token.redirectPath);
};
