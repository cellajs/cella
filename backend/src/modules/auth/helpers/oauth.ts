import { and, eq, or } from 'drizzle-orm';
import type { Context } from 'hono';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { type UserModel, usersTable } from '#/db/schema/users';
import { getParsedSessionCookie, setUserSession, validateSession } from './session';

import { type EnabledOauthProvider, config } from 'config';
import slugify from 'slugify';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { tokensTable } from '#/db/schema/tokens';
import { createError, errorRedirect, errorResponse } from '#/lib/errors';
import { logEvent } from '#/middlewares/logger/log-event';
import { getUsersByConditions } from '#/modules/users/helpers/get-user-by';
import { getIsoDate } from '#/utils/iso-date';
import { TimeSpan, isExpiredDate } from '#/utils/time-span';
import { type CookieName, deleteAuthCookie, getAuthCookie, setAuthCookie } from './cookie';
import type { githubUserEmailProps, githubUserProps, googleUserProps, microsoftUserProps } from './oauth-providers';
import { sendVerificationEmail } from './verify-email';

const cookieExpires = new TimeSpan(5, 'm');

/**
 * Creates an OAuth session by setting the necessary cookies and ensuring session validity before redirecting to the OAuth provider.
 *
 * @param ctx - Request/response context.
 * @param provider - OAuth provider (e.g., Google, GitHub, Microsoft).
 * @param url - URL of the OAuth provider's authorization endpoint.
 * @param state - OAuth state parameter to prevent CSRF attacks.
 * @param codeVerifier - Optional, code verifier for PKCE.
 * @param redirect - Optional, URL to redirect the user to after OAuth.
 * @param connect - Optional, user ID to connect the OAuth account to.
 * @param token - Optional, invitation token for the OAuth process.
 * @returns Redirect response to the OAuth provider's authorization URL.
 */
export const createOauthSession = async (
  ctx: Context,
  provider: string,
  url: URL,
  state: string,
  codeVerifier?: string,
  redirect?: string,
  connect?: string,
  token?: string | null,
) => {
  setAuthCookie(ctx, 'oauth_state', state, cookieExpires);
  // If connecting oauth account to user, make sure same user is logged in
  if (connect) {
    const sessionData = await getParsedSessionCookie(ctx);
    if (!sessionData) return errorResponse(ctx, 401, 'no_session', 'warn');

    const { user } = await validateSession(sessionData.sessionToken);
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

// Check if oauth account already exists
export const handleExistingOauthAccount = async (
  ctx: Context,
  oauthProvider: EnabledOauthProvider,
  oauthProviderId: string,
  currentUserId: string | null,
): Promise<'auth' | 'mismatch' | null> => {
  const [existingOauthAccount] = await findOauthAccount(oauthProvider, oauthProviderId);
  if (!existingOauthAccount) return null;
  // If the account is linked to another user, return an error
  if (currentUserId && existingOauthAccount.userId !== currentUserId) return 'mismatch';

  // Otherwise, set the session and redirect
  await setUserSession(ctx, existingOauthAccount.userId, oauthProvider);
  return 'auth';
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

/**
 * Create slug from email
 *
 * @param email
 * @returns A slug based on the email address
 */
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

/**
 * Update existing user
 *
 * @param ctx - Request/response context
 * @param existingUser - Existing user model
 * @param providerId - OAuth provider ID
 * @param params - Parameters for updating the user
 */
export const updateExistingUser = async (ctx: Context, existingUser: UserModel, providerId: EnabledOauthProvider, params: Params) => {
  const { providerUser, emailVerified, redirectUrl } = params;

  await insertOauthAccount(existingUser.id, providerId, providerUser.id);

  // Update user with auth provider data if not already present
  await db
    .update(usersTable)
    .set({
      thumbnailUrl: existingUser.thumbnailUrl || providerUser.thumbnailUrl,
      firstName: existingUser.firstName || providerUser.firstName,
      lastName: existingUser.lastName || providerUser.lastName,
    })
    .where(eq(usersTable.id, existingUser.id));

  // Send verification email if not verified and redirect to verify page
  if (!emailVerified) {
    sendVerificationEmail(providerUser.id);
    return ctx.redirect(`${config.frontendUrl}/auth/email-verification`, 302);
  }

  await db
    .insert(emailsTable)
    .values({ email: providerUser.email, userId: existingUser.id, verified: true, verifiedAt: getIsoDate() })
    .onConflictDoUpdate({
      target: emailsTable.email,
      set: { userId: existingUser.id, verifiedAt: getIsoDate(), verified: true },
    });

  // Sign in user
  await setUserSession(ctx, existingUser.id, providerId);

  return ctx.redirect(redirectUrl, 302);
};

/**
 * Handle invitation token helper
 *
 * @param ctx
 * @returns Object with token ID, redirect URL, and error
 */
export const handleInvitationToken = async (ctx: Context) => {
  const token = ctx.req.query('token');
  const redirect = ctx.req.query('redirect');

  if (!token) return { tokenId: null, redirectUrl: redirect, error: null };

  const [tokenRecord] = await db.select().from(tokensTable).where(eq(tokensTable.token, token));

  if (!tokenRecord) return { tokenId: null, redirectUrl: redirect, error: createError(ctx, 404, 'invitation_not_found', 'warn') };
  if (isExpiredDate(tokenRecord.expiresAt)) return { tokenId: null, redirectUrl: redirect, error: createError(ctx, 403, 'expired_token', 'warn') };
  if (tokenRecord.type !== 'invitation') return { tokenId: null, redirectUrl: redirect, error: createError(ctx, 400, 'invalid_token', 'warn') };

  return {
    tokenId: tokenRecord.id,
    redirectUrl: `${config.frontendUrl}/invitation/${tokenRecord.token}?tokenId=${tokenRecord.id}`,
    error: null,
  };
};

/**
 * Retrieve OAuth cookies (user ID and invite token) from the request context.
 *
 * @param  ctx - Hono context ojb.
 * @returns - An object containing `userId` and `inviteTokenId`, both or either can be null.
 */
export const getOauthCookies = async (ctx: Context) => {
  const [userId, inviteTokenId] = await Promise.all([getAuthCookie(ctx, 'oauth_connect_user_id'), getAuthCookie(ctx, 'oauth_invite_token')]);

  return { userId: userId || null, inviteTokenId: inviteTokenId || null };
};

/**
 * Find an existing user based on their email, user ID, or token ID.
 * This utility checks if a user already exists in the system based on one or more conditions.
 *
 * @param email - Email of  user to search for.
 * @param userId - User ID to search for (optional).
 * @param tokenId - Invite token ID to search for (optional).
 * @returns - Existing user or null if not found.
 */
export const findExistingUser = async (email: string, userId: string | null, tokenId: string | null): Promise<UserModel | null> => {
  const tokenUserId = tokenId
    ? await db
        .select({ userId: tokensTable.userId })
        .from(tokensTable)
        .where(eq(tokensTable.id, tokenId))
        .then(([result]) => result.userId)
    : null;

  const conditions = or(
    eq(usersTable.email, email),
    ...(userId ? [eq(usersTable.id, userId)] : []),
    ...(tokenUserId ? [eq(usersTable.id, tokenUserId)] : []),
  );

  const [existingUser] = await getUsersByConditions([conditions]);
  return existingUser || null;
};

/**
 * Transform social media user data (Google or Microsoft) into a standardized user object.
 * This helper formats the data received from the OAuth provider into a uniform user object.
 *
 * @param user - User data from OAuth provider (Google or Microsoft).
 * @returns  - Formatted user object.
 * @throws - If no email is found in user data.
 */
export const transformSocialUserData = (user: googleUserProps | microsoftUserProps) => {
  if (!user.email) throw new Error('no_email_found');

  const email = user.email.toLowerCase();

  return {
    id: user.sub,
    slug: slugFromEmail(email),
    email,
    name: user.name,
    emailVerified: 'email_verified' in user ? user.email_verified : false,
    thumbnailUrl: user.picture,
    firstName: user.given_name,
    lastName: user.family_name,
  };
};

/**
 * Transform GitHub user data into a standardized user object.
 * This helper formats the data received from GitHub and fetches the user's primary email.
 *
 * @param user - User data from GitHub.
 * @param emails - List of emails associated with GitHub user.
 * @returns - Formatted user object.
 * @throws - If no email is found in user data.
 */
export const transformGithubUserData = (user: githubUserProps, emails: githubUserEmailProps[]) => {
  const primaryEmail = emails.find((email) => email.primary);
  if (!primaryEmail) throw new Error('no_email_found');

  const email = primaryEmail.email.toLowerCase();
  const slug = slugify(user.login, { lower: true, strict: true });
  const { firstName, lastName } = splitFullName(user.name || slug);

  return {
    id: String(user.id),
    slug,
    email,
    name: user.name || user.login,
    emailVerified: primaryEmail.verified,
    thumbnailUrl: user.avatar_url,
    firstName,
    lastName,
  };
};
