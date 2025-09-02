import { db } from '#/db/db';
import { tokensTable } from '#/db/schema/tokens';
import { AppError } from '#/lib/errors';
import { type CookieName, deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/helpers/cookie';
import { getParsedSessionCookie, validateSession } from '#/modules/auth/helpers/session';
import { isExpiredDate } from '#/utils/is-expired-date';
import { isValidRedirectPath } from '#/utils/is-redirect-url';
import { logEvent } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';
import { appConfig } from 'config';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';

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
export const createOAuthSession = async (ctx: Context, provider: string, url: URL, state: string, codeVerifier?: string) => {
  await setAuthCookie(ctx, 'oauth-state', state, oauthCookieExpires);

  if (codeVerifier) await setAuthCookie(ctx, 'oauth-code-verifier', codeVerifier, oauthCookieExpires);

  logEvent('info', 'User redirected', { strategy: 'oauth', provider });

  return ctx.redirect(url.toString(), 302);
};

// Clear oauth session
export const clearOAuthSession = (ctx: Context) => {
  const cookies: CookieName[] = [
    'oauth-state',
    'oauth-code-verifier',
    'oauth-redirect',
    'oauth-connect-user-id',
    'oauth-invite-token-id',
    'oauth-invite-token-type',
  ];
  for (const cookie of cookies) {
    deleteAuthCookie(ctx, cookie);
  }
};

/**
 * Retrieve OAuth cookies (user ID and invite token) from the request context.
 *
 * @param  ctx - Hono context obj.
 * @returns - An object containing `connectUserId`, `inviteTokenId` and `inviteTokenType`, all or either can be null.
 */
export const getOAuthCookies = async (ctx: Context) => {
  const [connectUserId, inviteTokenId, inviteTokenType, verifyTokenId] = await Promise.all([
    getAuthCookie(ctx, 'oauth-connect-user-id'),
    getAuthCookie(ctx, 'oauth-invite-token-id'),
    getAuthCookie(ctx, 'oauth-invite-token-type'),
    getAuthCookie(ctx, 'oauth-verify-token-id'),
  ]);

  return {
    connectUserId: connectUserId || null,
    inviteToken: inviteTokenId && inviteTokenType ? { id: inviteTokenId, type: inviteTokenType } : null,
    verifyTokenId: verifyTokenId || null,
  };
};

/**
 * Handles setting the OAuth redirect URL as a cookie, ensuring it's properly formatted.
 *
 * @param ctx - Hono context obj.
 * @param redirect - path to redirect user after authentication
 */
export const setOAuthRedirect = async (ctx: Context, redirect: string) => {
  const decodedRedirect = decodeURIComponent(redirect);

  // Ensure redirect URL is absolute and valid
  const redirectPath = isValidRedirectPath(decodedRedirect) || appConfig.defaultRedirectPath;

  // Set redirect path in authentication cookie
  await setAuthCookie(ctx, 'oauth-redirect', redirectPath, oauthCookieExpires);
};

/**
 * Handles an invitation token validation and sets authentication cookies.
 *
 * @param ctx - The request context.
 * @returns Error response if invalid or expired, otherwise sets cookies for authentication.
 */
export const handleOAuthInvitation = async (ctx: Context) => {
  const token = ctx.req.query('token');
  if (!token) throw new AppError({ status: 404, type: 'invitation_not_found', severity: 'warn', isRedirect: true });

  // Fetch token record
  const [tokenRecord] = await db.select().from(tokensTable).where(eq(tokensTable.token, token));
  if (!tokenRecord) throw new AppError({ status: 404, type: 'invitation_not_found', severity: 'warn', isRedirect: true });
  if (isExpiredDate(tokenRecord.expiresAt)) throw new AppError({ status: 403, type: 'expired_token', severity: 'warn', isRedirect: true });
  if (tokenRecord.type !== 'invitation') throw new AppError({ status: 400, type: 'invalid_token', severity: 'error', isRedirect: true });

  // Determine redirection based on entity presence
  const isMembershipInvite = !!tokenRecord.entityType;
  const redirectPath = isMembershipInvite ? `/invitation/${tokenRecord.token}?tokenId=${tokenRecord.id}` : appConfig.defaultRedirectPath;

  // Set authentication cookies
  await Promise.all([
    setAuthCookie(ctx, 'oauth-invite-token-id', tokenRecord.id, oauthCookieExpires),
    setAuthCookie(ctx, 'oauth-invite-token-type', isMembershipInvite ? 'membership' : 'system', oauthCookieExpires),
    setOAuthRedirect(ctx, redirectPath),
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

  if (!connectingUserId) throw new AppError({ status: 404, type: 'oauth_connection_not_found', severity: 'error', isRedirect: true });

  const sessionData = await getParsedSessionCookie(ctx);
  if (!sessionData) throw new AppError({ status: 401, type: 'no_session', severity: 'warn', isRedirect: true });

  const { user } = await validateSession(sessionData.sessionToken);
  if (user.id !== connectingUserId) throw new AppError({ status: 403, type: 'user_mismatch', severity: 'warn', isRedirect: true });

  await setAuthCookie(ctx, 'oauth-connect-user-id', connectingUserId, oauthCookieExpires);
};

/**
 * Handles verify an OAuth account to a user.
 * Ensures given token is valid
 *
 * @param ctx Request context
 * @returns Error object if validation fails, otherwise null
 */
export const handleOAuthVerify = async (ctx: Context) => {
  // Find token in request
  const token = ctx.req.query('token');
  if (!token) throw new AppError({ status: 400, type: 'invalid_request', severity: 'error', isRedirect: true });

  // Check if token exists
  const [tokenRecord] = await db.select().from(tokensTable).where(eq(tokensTable.token, token));

  if (!tokenRecord) {
    throw new AppError({
      status: 404,
      type: 'email_verification_not_found',
      severity: 'warn',
      meta: { requiredType: 'email_verification_not_found' },
    });
  }
  // If token is expired, return an error
  if (isExpiredDate(tokenRecord.expiresAt)) {
    throw new AppError({
      status: 401,
      type: 'email_verification_not_found',
      severity: 'warn',
      meta: { requiredType: 'email_verification_not_found' },
    });
  }
  // Check if token type matches the required type (if specified)
  if (tokenRecord.type !== 'email_verification') {
    throw new AppError({ status: 401, type: 'invalid_token', severity: 'warn', meta: { requiredType: 'email_verification_not_found' } });
  }

  // Determine redirection based on entity presence
  const isMembershipInvite = !!tokenRecord.entityType;
  const redirectPath = isMembershipInvite ? `/invitation/${tokenRecord.token}?tokenId=${tokenRecord.id}` : appConfig.defaultRedirectPath;

  // Set authentication cookies
  await Promise.all([setAuthCookie(ctx, 'oauth-verify-token-id', tokenRecord.id, oauthCookieExpires), setOAuthRedirect(ctx, redirectPath)]);

  return null;
};
