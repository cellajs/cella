import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { oauthAccountsTable } from '../../../db/schema/oauth-accounts';
import { usersTable, type InsertUserModel } from '../../../db/schema/users';
import { setCookie, setSessionCookie } from './cookies';

import { config } from 'config';
import type { User } from 'lucia';
import slugify from 'slugify';
import { db } from '../../../db/db';
import { logEvent } from '../../../middlewares/logger/log-event';
import type { OauthProviderOptions } from '../../../types/common';
import { sendVerificationEmail } from './verify-email';

// * Create a session before redirecting to the oauth provider
export const createSession = (ctx: Context, provider: string, state: string, codeVerifier?: string, redirect?: string) => {
  setCookie(ctx, 'oauth_state', state);

  if (codeVerifier) setCookie(ctx, 'oauth_code_verifier', codeVerifier);
  if (redirect) setCookie(ctx, 'oauth_redirect', redirect);

  logEvent('User redirected', { strategy: provider });
};

// * Get the redirect URL from the cookie or use default
export const getRedirectUrl = (ctx: Context, firstSignIn?: boolean): string => {
  const redirectCookie = getCookie(ctx, 'oauth_redirect');
  let redirectUrl = config.frontendUrl + config.defaultRedirectPath;
  if (redirectCookie) redirectUrl = config.frontendUrl + decodeURIComponent(redirectCookie);
  if (firstSignIn) redirectUrl = config.frontendUrl + config.firstSignInRedirectPath;
  return redirectUrl;
};

// * Insert oauth account into db
export const insertOauthAccount = async (userId: string, providerId: OauthProviderOptions, providerUserId: string) => {
  db.insert(oauthAccountsTable).values({ providerId, providerUserId, userId });
};

// * Find oauth account in db
export const findOauthAccount = async (providerId: OauthProviderOptions, providerUserId: string) => {
  return db
    .select()
    .from(oauthAccountsTable)
    .where(and(eq(oauthAccountsTable.providerId, providerId), eq(oauthAccountsTable.providerUserId, providerUserId)));
};

// * Find user by email
export const findUserByEmail = async (email: string) => {
  return db.select().from(usersTable).where(eq(usersTable.email, email));
};

// * Create a slug from email
export const slugFromEmail = (email: string) => {
  const [alias] = email.split('@');
  return slugify(alias, { lower: true });
};

// * Split full name into first and last name
export const splitFullName = (name: string) => {
  const [firstName, lastName] = name.split(' ');
  return { firstName: firstName || '', lastName: lastName || '' };
};

// * Handle existing user
export const handleExistingUser = async (
  ctx: Context,
  existingUser: User,
  providerId: OauthProviderOptions,
  {
    providerUser,
    isEmailVerified,
    redirectUrl,
  }: {
    providerUser: Pick<InsertUserModel, 'thumbnailUrl' | 'bio' | 'firstName' | 'lastName' | 'id' | 'email'>;
    isEmailVerified: boolean;
    redirectUrl: string;
  },
) => {
  await insertOauthAccount(existingUser.id, providerId, providerUser.id);

  // * Update user with provider data if not already present
  await db
    .update(usersTable)
    .set({
      thumbnailUrl: existingUser.thumbnailUrl || providerUser.thumbnailUrl,
      bio: existingUser.bio || providerUser.bio,
      emailVerified: isEmailVerified,
      firstName: existingUser.firstName || providerUser.firstName,
      lastName: existingUser.lastName || providerUser.lastName,
    })
    .where(eq(usersTable.id, existingUser.id));

  // * Send verification email if not verified and redirect to verify page
  if (!isEmailVerified) {
    sendVerificationEmail(providerUser.email.toLowerCase());

    return ctx.redirect(`${config.frontendUrl}/auth/verify-email`, 302);
  }

  await setSessionCookie(ctx, existingUser.id, providerId.toLowerCase());

  return ctx.redirect(redirectUrl, 302);
};
