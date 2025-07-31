import { appConfig } from 'config';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from '#/db/db';
import { tokensTable } from '#/db/schema/tokens';
import { ApiError } from '#/lib/errors';
import { type CookieName, deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/helpers/cookie';
import { getParsedSessionCookie, validateSession } from '#/modules/auth/helpers/session';
import { isExpiredDate } from '#/utils/is-expired-date';
import { isRedirectUrl } from '#/utils/is-redirect-url';
import { logEvent } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';

export const oauthCookieExpires = new TimeSpan(5, 'm');

/**
 * Creates an OAuth session by setting the necessary cookies and ensuring session validity before redirecting to the OAuth provider.
 *
 * @param ctx - Request/response context.
 * @param strategy - OAuth provider (e.g., Google, GitHub, Microsoft).
 * @param url - URL of the OAuth provider's authorization endpoint.
 * @param state - OAuth state parameter to prevent CSRF attacks.
 * @param codeVerifier - Optional, code verifier for PKCE.
 * @returns Redirect response to the OAuth provider's authorization URL.
 */
export const createOauthSession = async (ctx: Context, strategy: string, url: URL, state: string, codeVerifier?: string) => {
  await setAuthCookie(ctx, 'oauth_state', state, oauthCookieExpires);

  if (codeVerifier) await setAuthCookie(ctx, 'oauth_code_verifier', codeVerifier, oauthCookieExpires);

  logEvent({ msg: 'User redirected', meta: { strategy } });

  return ctx.redirect(url.toString(), 302);
};

// Clear oauth session
export const clearOauthSession = (ctx: Context) => {
  const cookies: CookieName[] = [
    'oauth_state',
    'oauth_code_verifier',
    'oauth_redirect',
    'oauth_connect_user_id',
    'oauth_invite_token_id',
    'oauth_invite_token_type',
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
    getAuthCookie(ctx, 'oauth_invite_token_id'),
    getAuthCookie(ctx, 'oauth_invite_token_type'),
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
  const redirectUrl = isRedirectUrl(passedRedirect) ? passedRedirect : `${appConfig.frontendUrl}${passedRedirect}`;

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
  if (!token) throw new ApiError({ status: 404, type: 'invitation_not_found', severity: 'warn' });

  // Fetch token record
  const [tokenRecord] = await db.select().from(tokensTable).where(eq(tokensTable.token, token));
  if (!tokenRecord) throw new ApiError({ status: 404, type: 'invitation_not_found', severity: 'warn' });
  if (isExpiredDate(tokenRecord.expiresAt)) throw new ApiError({ status: 403, type: 'expired_token', severity: 'warn' });
  if (tokenRecord.type !== 'invitation') throw new ApiError({ status: 400, type: 'invalid_token', severity: 'error' });

  // Determine redirection based on entity presence
  const isMembershipInvite = !!tokenRecord.entityType;
  const redirectUrl = isMembershipInvite ? `/invitation/${tokenRecord.token}?tokenId=${tokenRecord.id}` : '/welcome';

  // Set authentication cookies
  await Promise.all([
    setAuthCookie(ctx, 'oauth_invite_token_id', tokenRecord.id, oauthCookieExpires),
    setAuthCookie(ctx, 'oauth_invite_token_type', isMembershipInvite ? 'membership' : 'system', oauthCookieExpires),
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

  if (!connectingUserId) throw new ApiError({ status: 404, type: 'oauth_connection_not_found', severity: 'error' });

  const sessionData = await getParsedSessionCookie(ctx);
  if (!sessionData) throw new ApiError({ status: 401, type: 'no_session', severity: 'warn' });

  const { user } = await validateSession(sessionData.sessionToken);
  if (user?.id !== connectingUserId) throw new ApiError({ status: 403, type: 'user_mismatch', severity: 'warn' });

  await setAuthCookie(ctx, 'oauth_connect_user_id', connectingUserId, oauthCookieExpires);
};
