import { appConfig } from 'config';
import { eq } from 'drizzle-orm';
import { Context } from 'hono';
import { db } from '#/db/db';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { TokenModel } from '#/db/schema/tokens';
import { Env } from '#/lib/context';
import { AppError } from '#/lib/errors';

export const handleOAuthVerification = async (ctx: Context<Env>, token: TokenModel) => {
  // Token requires userId and oauthAccountId
  if (!token.userId || !token.oauthAccountId) throw new AppError({ status: 400, type: 'invalid_request', severity: 'error' });

  const [oauthAccount] = await db.select().from(oauthAccountsTable).where(eq(oauthAccountsTable.id, token.oauthAccountId)).limit(1);
  if (!oauthAccount) throw new AppError({ status: 400, type: 'invalid_request', severity: 'warn' });

  const verifyPath = `/auth/${oauthAccount.provider}`;
  const verificationURL = new URL(verifyPath, appConfig.backendUrl);

  verificationURL.searchParams.set('tokenId', token.id);
  verificationURL.searchParams.set('type', 'verify');
  return ctx.redirect(verificationURL, 302);
};
