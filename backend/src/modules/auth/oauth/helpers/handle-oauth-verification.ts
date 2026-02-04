import { eq } from 'drizzle-orm';
import { Context } from 'hono';
import { appConfig } from 'shared';
import { db } from '#/db/db';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { TokenModel } from '#/db/schema/tokens';
import { Env } from '#/lib/context';
import { AppError } from '#/lib/error';

export const handleOAuthVerification = async (ctx: Context<Env>, token: TokenModel) => {
  // Token requires userId and oauthAccountId
  if (!token.userId || !token.oauthAccountId) throw new AppError(500, 'server_error', 'error');

  const [oauthAccount] = await db
    .select()
    .from(oauthAccountsTable)
    .where(eq(oauthAccountsTable.id, token.oauthAccountId))
    .limit(1);
  if (!oauthAccount) throw new AppError(400, 'invalid_request', 'warn');

  const verifyPath = `/auth/${oauthAccount.provider}`;
  const verificationURL = new URL(verifyPath, appConfig.backendUrl);

  verificationURL.searchParams.set('tokenId', token.id);
  verificationURL.searchParams.set('type', 'verify');

  const reqRedirect = ctx.req.query('redirectAfter');
  if (reqRedirect) verificationURL.searchParams.set('redirectAfter', reqRedirect);

  return ctx.redirect(verificationURL, 302);
};
