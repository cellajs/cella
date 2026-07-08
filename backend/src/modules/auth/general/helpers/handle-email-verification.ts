import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { initiateMfa } from '#/modules/auth/general/helpers/mfa';
import { getPostAuthRedirectPath } from '#/modules/auth/general/helpers/redirect-path';
import { setUserSession } from '#/modules/auth/general/helpers/session';
import type { TokenModel } from '#/modules/auth/tokens-db';
import { emailsTable } from '#/modules/user/emails-db';
import { userSelect } from '#/modules/user/helpers/select';
import { usersTable } from '#/modules/user/user-db';
import { getIsoDate } from '#/utils/iso-date';

export const handleEmailVerification = async (ctx: Context<Env>, token: TokenModel) => {
  // Token requires userId
  if (!token.userId) throw new AppError(500, 'server_error', 'error');

  // Get user
  const [user] = await db.select(userSelect).from(usersTable).where(eq(usersTable.id, token.userId)).limit(1);
  if (!user) throw new AppError(404, 'not_found', 'error', { entityType: 'user', meta: { userId: token.userId } });

  // Set email verified if it exists
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

  // Start MFA challenge if the user has MFA enabled
  const mfaRedirectPath = await initiateMfa(ctx, user);

  const redirectPath = mfaRedirectPath || getPostAuthRedirectPath(user);
  const redirectUrl = new URL(redirectPath, appConfig.frontendUrl);

  // If MFA is not required, set user session immediately
  if (!mfaRedirectPath) await setUserSession(ctx, user, 'email');

  return ctx.redirect(redirectUrl, 302);
};
