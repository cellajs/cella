import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { finishSignIn } from '#/modules/auth/general/helpers/finish-sign-in';
import type { TokenModel } from '#/modules/auth/tokens-db';
import { emailsTable } from '#/modules/user/emails-db';
import { userSelect } from '#/modules/user/helpers/select';
import { usersTable } from '#/modules/user/user-db';
import { getIsoDate } from '#/utils/iso-date';

export const handleEmailVerification = async (ctx: Context<Env>, token: TokenModel) => {
  if (!token.userId) throw new AppError(500, 'server_error', 'error');

  const [user] = await db.select(userSelect).from(usersTable).where(eq(usersTable.id, token.userId)).limit(1);
  if (!user) throw new AppError(404, 'not_found', 'error', { entityType: 'user', meta: { userId: token.userId } });

  await db
    .update(emailsTable)
    .set({ verified: true, verifiedAt: getIsoDate() })
    .where(
      and(
        eq(emailsTable.tokenId, token.id),
        eq(emailsTable.userId, token.userId),
        eq(emailsTable.email, token.email),
        eq(emailsTable.verified, false),
      ),
    );

  return finishSignIn(ctx, user, 'email', token.redirectPath);
};
