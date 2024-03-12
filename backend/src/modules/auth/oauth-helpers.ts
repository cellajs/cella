import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { oauthAccountsTable } from '../../db/schema/oauth-accounts';
import { usersTable } from '../../db/schema/users';
import { setCookie } from './helpers/cookies';

import { config } from 'config';
import { db } from '../../db/db';
import { logEvent } from '../../middlewares/logger/log-event';

type ProviderId = 'GITHUB' | 'MICROSOFT' | 'GOOGLE';

// * Create a session before redirecting to the oauth provider
export const createSession = (ctx: Context, provider: string, state: string, codeVerifier?: string, redirect?: string) => {
  setCookie(ctx, 'oauth_state', state);

  if (codeVerifier) setCookie(ctx, 'oauth_code_verifier', codeVerifier);
  if (redirect) setCookie(ctx, 'oauth_redirect', redirect);

  logEvent('User redirected', { strategy: provider });
};

// * Get the redirect URL from the cookie or use default
export const getRedirectUrl = (ctx: Context): string => {
  const redirectCookie = getCookie(ctx, 'oauth_redirect');
  let redirectUrl = config.frontendUrl + config.defaultRedirectPath;
  if (redirectCookie) redirectUrl = config.frontendUrl + decodeURIComponent(redirectCookie);

  return redirectUrl;
};

// * Insert oauth account into db
export const insertOauthAccount = async (userId: string, providerId: ProviderId, providerUserId: string) => {
  db.insert(oauthAccountsTable).values({ providerId, providerUserId, userId });
};

// * Find oauth account in db
export const findOauthAccount = async (providerId: ProviderId, providerUserId: string) => {
  return db
    .select()
    .from(oauthAccountsTable)
    .where(and(eq(oauthAccountsTable.providerId, providerId), eq(oauthAccountsTable.providerUserId, providerUserId)));
};

// * Find user by email
export const findUserByEmail = async (email: string) => {
  return db.select().from(usersTable).where(eq(usersTable.email, email));
};
