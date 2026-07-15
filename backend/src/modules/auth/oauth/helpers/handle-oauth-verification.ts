import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { oauthAccountsTable } from '#/modules/auth/oauth/oauth-accounts-db';
import type { TokenModel } from '#/modules/auth/tokens-db';

export const handleOAuthVerification = async (ctx: Context<Env>, token: TokenModel) => {
  // Token requires userId and oauthAccountId
  if (!token.userId || !token.oauthAccountId) throw new AppError(500, 'server_error', 'error');

  const [oauthAccount] = await db
    .select()
    .from(oauthAccountsTable)
    .where(eq(oauthAccountsTable.id, token.oauthAccountId))
    .limit(1);
  if (!oauthAccount) throw new AppError(400, 'invalid_request', 'warn');

  // Concatenate onto backendAuthUrl (which already ends in /auth) so the /api base path is
  // preserved; new URL(absolutePath, backendUrl) would drop it.
  const verificationURL = new URL(`${appConfig.backendAuthUrl}/${oauthAccount.provider}`);

  verificationURL.searchParams.set('tokenId', token.id);
  verificationURL.searchParams.set('type', 'verify');

  const reqRedirect = ctx.req.query('redirectAfter');
  if (reqRedirect) verificationURL.searchParams.set('redirectAfter', reqRedirect);

  return ctx.redirect(verificationURL, 302);
};
