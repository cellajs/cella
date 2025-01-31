import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { type UserModel, usersTable } from '#/db/schema/users';
import { setUserSession, validateSession } from './session';

import type { EnabledOauthProvider } from 'config';
import { config } from 'config';
import slugify from 'slugify';
import { db } from '#/db/db';
import { errorRedirect, errorResponse } from '#/lib/errors';
import { logEvent } from '#/middlewares/logger/log-event';
import { TimeSpan } from '#/utils/time-span';
import { type CookieName, deleteAuthCookie, getAuthCookie, setAuthCookie } from './cookie';
import { sendVerificationEmail } from './verify-email';

const cookieExpires = new TimeSpan(5, 'm');

// Create a session before redirecting to oauth provider
export const createOauthSession = async (
  ctx: Context,
  provider: string,
  url: URL,
  state: string,
  codeVerifier?: string,
  redirect?: string,
  connect?: string,
  token?: string,
) => {
  setAuthCookie(ctx, 'oauth_state', state, cookieExpires);
  // If connecting oauth account to user, make sure same user is logged in
  if (connect) {
    const sessionToken = await getAuthCookie(ctx, 'session');
    if (!sessionToken) return errorResponse(ctx, 401, 'no_session', 'warn');
    const { user } = await validateSession(sessionToken);
    if (user?.id !== connect) return errorResponse(ctx, 404, 'user_mismatch', 'warn');
  }

  // If sign up is disabled, stop early if no token or connect
  if (!config.has.registrationEnabled && !token && !connect) return errorRedirect(ctx, 'sign_up_restricted', 'warn');

  if (codeVerifier) await setAuthCookie(ctx, 'oauth_code_verifier', codeVerifier, cookieExpires);
  if (redirect) await setAuthCookie(ctx, 'oauth_redirect', redirect, cookieExpires);
  if (connect) await setAuthCookie(ctx, 'oauth_connect_user_id', connect, cookieExpires);
  if (token) await setAuthCookie(ctx, 'oauth_invite_token', token, cookieExpires);

  logEvent('User redirected', { strategy: provider });

  return ctx.redirect(url.toString(), 302);
};

// Clear oauth session
export const clearOauthSession = (ctx: Context) => {
  const cookies: CookieName[] = ['oauth_state', 'oauth_code_verifier', 'oauth_redirect', 'oauth_connect_user_id', 'oauth_invite_token'];
  for (const cookie of cookies) {
    deleteAuthCookie(ctx, cookie);
  }
};

// Get redirect URL from cookie or use default
export const getOauthRedirectUrl = async (ctx: Context, firstSignIn?: boolean) => {
  const redirectCookie = await getAuthCookie(ctx, 'oauth_redirect');

  const redirectCookieUrl = redirectCookie ? decodeURIComponent(redirectCookie) : '';
  let redirectPath = config.defaultRedirectPath;

  if (redirectCookie) {
    if (redirectCookieUrl.startsWith('http')) return decodeURIComponent(redirectCookie);
    redirectPath = redirectCookieUrl;
  }

  if (firstSignIn) redirectPath = config.welcomeRedirectPath;
  return config.frontendUrl + redirectPath;
};

// Insert oauth account into db
export const insertOauthAccount = async (userId: string, providerId: EnabledOauthProvider, providerUserId: string) => {
  await db.insert(oauthAccountsTable).values({ providerId, providerUserId, userId });
};

// Find oauth account in db
export const findOauthAccount = async (providerId: EnabledOauthProvider, providerUserId: string) => {
  return db
    .select()
    .from(oauthAccountsTable)
    .where(and(eq(oauthAccountsTable.providerId, providerId), eq(oauthAccountsTable.providerUserId, providerUserId)));
};

// Create slug from email
export const slugFromEmail = (email: string) => {
  const [alias] = email.split('@');
  return slugify(alias, { lower: true, strict: true });
};

// Split full name into first and last name
export const splitFullName = (name: string) => {
  const [firstName, lastName] = name.split(' ');
  return { firstName: firstName || '', lastName: lastName || '' };
};

interface Params {
  providerUser: Pick<UserModel, 'thumbnailUrl' | 'firstName' | 'lastName' | 'id' | 'email'>;
  emailVerified: boolean;
  redirectUrl: string;
}

// Update existing user
export const updateExistingUser = async (ctx: Context, existingUser: UserModel, providerId: EnabledOauthProvider, params: Params) => {
  const { providerUser, emailVerified, redirectUrl } = params;

  await insertOauthAccount(existingUser.id, providerId, providerUser.id);

  // Update user with auth provider data if not already present
  await db
    .update(usersTable)
    .set({
      thumbnailUrl: existingUser.thumbnailUrl || providerUser.thumbnailUrl,
      emailVerified,
      firstName: existingUser.firstName || providerUser.firstName,
      lastName: existingUser.lastName || providerUser.lastName,
    })
    .where(eq(usersTable.id, existingUser.id));

  // Send verification email if not verified and redirect to verify page
  if (!emailVerified) {
    sendVerificationEmail(providerUser.id);
    return ctx.redirect(`${config.frontendUrl}/auth/email-verification`, 302);
  }

  // Sign in user
  await setUserSession(ctx, existingUser.id, providerId);

  return ctx.redirect(redirectUrl, 302);
};
