import { appConfig } from 'config';
import { and, eq } from 'drizzle-orm';
import { Context } from 'hono';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import type { TokenModel } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';
import { Env } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { initiateMfa } from '#/modules/auth/general/helpers/mfa';
import { setUserSession } from '#/modules/auth/general/helpers/session';
import { userSelect } from '#/modules/users/helpers/select';
import { getIsoDate } from '#/utils/iso-date';

export const handleEmailVerification = async (ctx: Context<Env>, token: TokenModel) => {
  // Token requires userId
  if (!token.userId) throw new AppError({ status: 400, type: 'invalid_request', severity: 'error' });

  // Get user
  const [user] = await db.select(userSelect).from(usersTable).where(eq(usersTable.id, token.userId)).limit(1);
  if (!user)
    throw new AppError({
      status: 404,
      type: 'not_found',
      severity: 'error',
      entityType: 'user',
      meta: { userId: token.userId },
    });

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

  // Determine redirect path
  const redirectPath = mfaRedirectPath || appConfig.defaultRedirectPath;
  const redirectUrl = new URL(redirectPath, appConfig.frontendUrl);

  // If MFA is not required, set user session immediately
  if (!mfaRedirectPath) await setUserSession(ctx, user, 'email');

  return ctx.redirect(redirectUrl, 302);
};
