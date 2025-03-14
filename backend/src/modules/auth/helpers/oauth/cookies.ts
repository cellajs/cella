import { config } from 'config';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from '#/db/db';
import { tokensTable } from '#/db/schema/tokens';
import { createError } from '#/lib/errors';
import { logEvent } from '#/middlewares/logger/log-event';
import { TimeSpan, isExpiredDate } from '#/utils/time-span';
import { type CookieName, deleteAuthCookie, getAuthCookie, setAuthCookie } from '../cookie';
import { getParsedSessionCookie, validateSession } from '../session';

export const oauthCookieExpires = new TimeSpan(5, 'm');

/**
 * Creates an OAuth session by setting the necessary cookies and ensuring session validity before redirecting to the OAuth provider.
 *
 * @param ctx - Request/response context.
 * @param provider - OAuth provider (e.g., Google, GitHub, Microsoft).
 * @param url - URL of the OAuth provider's authorization endpoint.
 * @param state - OAuth state parameter to prevent CSRF attacks.
 * @param codeVerifier - Optional, code verifier for PKCE.
 * @returns Redirect response to the OAuth provider's authorization URL.
 */
export const createOauthSession = async (ctx: Context, provider: string, url: URL, state: string, codeVerifier?: string) => {
  await setAuthCookie(ctx, 'oauth_state', state, oauthCookieExpires);

  if (codeVerifier) await setAuthCookie(ctx, 'oauth_code_verifier', codeVerifier, oauthCookieExpires);

  logEvent('User redirected', { strategy: provider });

  return ctx.redirect(url.toString(), 302);
};

// Clear oauth session
export const clearOauthSession = (ctx: Context) => {
  const cookies: CookieName[] = [
    'oauth_state',
    'oauth_code_verifier',
    'oauth_redirect',
    'oauth_connect_user_id',
    'oauth_invite_tokenId',
    'oauth_invite_tokenType',
  ];
  for (const cookie of cookies) {
    deleteAuthCookie(ctx, cookie);
  }
};

/**
 * Retrieve OAuth cookies (user ID and invite token) from the request context.
 *
 * @param  ctx - Hono context ojb.
 * @returns - An object containing `connectUserId`, `inviteTokenId` and `inviteTokenType`, all or either can be null.
 */
export const getOauthCookies = async (ctx: Context) => {
  const [connectUserId, inviteTokenId, inviteTokenType] = await Promise.all([
    getAuthCookie(ctx, 'oauth_connect_user_id'),
    getAuthCookie(ctx, 'oauth_invite_tokenId'),
    getAuthCookie(ctx, 'oauth_invite_tokenType'),
  ]);

  return {
    connectUserId: connectUserId || null,
    inviteToken: inviteTokenId && inviteTokenType ? { id: inviteTokenId, type: inviteTokenType } : null,
  };
};

/**
 * Handles setting the OAuth redirect URL as a cookie, ensuring it's properly formatted.
 *
 * @param ctx - Hono context ojb.
 * @param redirectUrl - URL to redirect user after authentication
 */
export const handleOAuthRedirect = async (ctx: Context, passedRedirect: string) => {
  // Ensure the redirect URL is absolute and valid
  const redirectUrl =
    passedRedirect.startsWith(config.publicCDNUrl) || passedRedirect.startsWith(config.frontendUrl)
      ? passedRedirect
      : `${config.frontendUrl}${passedRedirect}`;

  // Set the redirect URL in the authentication cookie
  await setAuthCookie(ctx, 'oauth_redirect', redirectUrl, oauthCookieExpires);
};

/**
 * Handles an invitation token validation and sets authentication cookies.
 *
 * @param ctx - The request context.
 * @returns Error response if invalid or expired, otherwise sets cookies for authentication.
 */
export const handleOAuthInvitation = async (ctx: Context) => {
  const token = ctx.req.query('token');
  if (!token) return createError(ctx, 404, 'invitation_not_found', 'warn');

  // Fetch token record
  const [tokenRecord] = await db.select().from(tokensTable).where(eq(tokensTable.token, token));
  if (!tokenRecord) return createError(ctx, 404, 'invitation_not_found', 'warn');
  if (isExpiredDate(tokenRecord.expiresAt)) return createError(ctx, 403, 'expired_token', 'warn');
  if (tokenRecord.type !== 'invitation') return createError(ctx, 400, 'invalid_token', 'error');

  // Determine redirection based on entity presence
  const isMembershipInvite = !!tokenRecord.entity;
  const redirectUrl = isMembershipInvite ? `/invitation/${tokenRecord.token}?tokenId=${tokenRecord.id}` : '/welcome';

  // Set authentication cookies
  await Promise.all([
    setAuthCookie(ctx, 'oauth_invite_tokenId', tokenRecord.id, oauthCookieExpires),
    setAuthCookie(ctx, 'oauth_invite_tokenType', isMembershipInvite ? 'membership' : 'system', oauthCookieExpires),
    handleOAuthRedirect(ctx, redirectUrl),
  ]);
  return null;
};

/**
 * Handles connecting an OAuth account to a user.
 * Ensures that user attempting to connect is same as logged-in user.
 *
 * @param ctx Request context
 * @returns Error object if validation fails, otherwise null
 */
export const handleOAuthConnection = async (ctx: Context) => {
  const connectingUserId = ctx.req.query('connect');

  if (!connectingUserId) return createError(ctx, 404, 'oauth_connection_not_found', 'error');

  const sessionData = await getParsedSessionCookie(ctx);
  if (!sessionData) return createError(ctx, 401, 'no_session', 'warn');

  const { user } = await validateSession(sessionData.sessionToken);
  if (user?.id !== connectingUserId) return createError(ctx, 403, 'user_mismatch', 'warn');

  await setAuthCookie(ctx, 'oauth_connect_user_id', connectingUserId, oauthCookieExpires);
  return null;
};
