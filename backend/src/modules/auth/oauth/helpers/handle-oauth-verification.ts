import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { identitiesTable } from '#/modules/auth/identities-db';
import type { TokenModel } from '#/modules/auth/tokens-db';

export const handleOAuthVerification = async (ctx: Context<Env>, token: TokenModel) => {
  if (!token.userId || !token.identityId) throw new AppError(500, 'server_error', 'error');

  const [identity] = await db.select().from(identitiesTable).where(eq(identitiesTable.id, token.identityId)).limit(1);
  if (!identity) throw new AppError(400, 'invalid_request', 'warn');

  const verificationURL = new URL(`${appConfig.backendAuthUrl}/${identity.provider}`);

  verificationURL.searchParams.set('tokenId', token.id);
  verificationURL.searchParams.set('type', 'verify');

  // The post-auth redirect stays on the token row; the verify initiation reads it from there.
  return ctx.redirect(verificationURL, 302);
};
