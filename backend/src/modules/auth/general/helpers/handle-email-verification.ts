import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { finishSignIn } from '#/modules/auth/general/helpers/finish-sign-in';
import { requireEmailVerified } from '#/modules/auth/general/helpers/mark-email-verified';
import type { TokenModel } from '#/modules/auth/tokens-db';
import { userSelect } from '#/modules/user/helpers/select';
import { usersTable } from '#/modules/user/user-db';

export const handleEmailVerification = async (ctx: Context<Env>, token: TokenModel) => {
  if (!token.userId) throw new AppError(500, 'server_error', 'error');

  const [user] = await db.select(userSelect).from(usersTable).where(eq(usersTable.id, token.userId)).limit(1);
  if (!user) throw new AppError(404, 'not_found', 'error', { entityType: 'user', meta: { userId: token.userId } });

  await requireEmailVerified(db, { userId: token.userId, email: token.email });

  return finishSignIn(ctx, user, 'email', token.redirectPath);
};
