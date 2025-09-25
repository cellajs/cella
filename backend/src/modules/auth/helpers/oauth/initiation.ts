import { appConfig } from 'config';
import type { Context } from 'hono';
import { AppError } from '#/lib/errors';
import { setAuthCookie } from '#/modules/auth/helpers/cookie';
import { getParsedSessionCookie, validateSession } from '#/modules/auth/helpers/session';
import { isValidRedirectPath } from '#/utils/is-redirect-url';
import { logEvent } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';
import { getValidToken } from '#/utils/validate-token';

export interface OAuthCookiePayload {
  redirectPath: string;
  inviteTokenId: string | null;
  connectUserId: string | null;
  verifyTokenId: string | null;
  codeVerifier?: string;
}

/**
 * Creates an OAuth session by setting the necessary cookies and redirecting to the provider.
 *
 * - Stores OAuth flow context (invite, connect, verify, or default)
 * - Associates the context with the OAuth `state` to prevent CSRF
 * - Optionally includes PKCE `codeVerifier`
 *
 * @param ctx - Hono context
 * @param provider - OAuth provider name
 * @param url - Provider’s authorization endpoint
 * @param state - OAuth state param
 * @param codeVerifier - PKCE code verifier (optional)
 * @returns redirect response
 */
export const handleOAuthInitiation = async (ctx: Context, provider: string, url: URL, state: string, codeVerifier?: string) => {
  const { type } = ctx.req.query();

  const payload = await getOAuthPayload(ctx);
  const cookieContent = JSON.stringify({ ...payload, codeVerifier });

  await setAuthCookie(ctx, `oauth-${state}`, cookieContent, new TimeSpan(5, 'm'));

  logEvent('info', 'User redirected to OAuth provider', { strategy: 'oauth', provider, type });

  return ctx.redirect(url.toString(), 302);
};

/**
 * Stores OAuth context (invite/connect/verify/auth) so that the callback
 * can resume the correct flow. Called at the start of an OAuth process.
 *
 * - invite → validates invitation token, sets invite cookie, stores redirect
 * - connect → validates connecting user, sets connection cookie
 * - verify → validates email verification token, sets verify cookie, stores redirect
 * - auth (default) → sets default redirect
 *
 * Always returns a normalized payload describing the flow.
 *
 * @param ctx - Hono request/response context.
 *
 */
// TODO this doesnt look very clean in the cookie when inspecting it in devtools, maybe hash it or encode it?
const getOAuthPayload = async (ctx: Context) => {
  const { type, redirect } = ctx.req.query();

  // default payload
  let redirectPath = resolveOAuthRedirect(redirect);
  let inviteTokenId: string | null = null;
  let connectUserId: string | null = null;
  let verifyTokenId: string | null = null;

  switch (type) {
    case 'invite': {
      ({ inviteTokenId, redirectPath } = await prepareOAuthAcceptInvite(ctx));
      break;
    }
    case 'connect': {
      ({ connectUserId, redirectPath } = await prepareOAuthConnect(ctx));
      break;
    }
    case 'verify': {
      ({ verifyTokenId, redirectPath } = await prepareOAuthVerify(ctx));
      break;
    }
    default:
      break;
  }

  return { redirectPath, inviteTokenId, connectUserId, verifyTokenId };
};
/**
 * Resolves and validates the redirect path used after OAuth.
 *
 * - Decodes the provided redirect query param
 * - Ensures it’s a safe/valid redirect path
 * - Falls back to the app default if invalid or missing
 *
 * @param redirect - raw redirect query param
 * @returns safe redirect path
 */
const resolveOAuthRedirect = (redirect?: string): string => {
  if (!redirect) return appConfig.defaultRedirectPath;

  const decoded = decodeURIComponent(redirect);
  return isValidRedirectPath(decoded) || appConfig.defaultRedirectPath;
};

/**
 * Validates and extracts invitation context for an OAuth flow.
 *
 * - Ensures `token` is present
 * - Fetches and validates the token record
 * - Determines correct redirect path based on entity type
 *
 * @param ctx - Hono context
 * @returns tokenId + redirectPath
 * @throws AppError if token is missing or invalid
 */
const prepareOAuthAcceptInvite = async (ctx: Context) => {
  const { tokenId, token } = ctx.req.query();

  // Must provide a token and tokenId
  if (!token || !tokenId) throw new AppError({ status: 400, type: 'invalid_request', severity: 'error', isRedirect: true });

  const tokenRecord = await getValidToken({ requiredType: 'invitation', tokenId, consumeToken: false });

  const redirectPath = tokenRecord.entityType ? `/invitation/${tokenRecord.token}` : appConfig.defaultRedirectPath;

  return { inviteTokenId: tokenRecord.id, redirectPath };
};

/**
 * Validates and extracts connection context for an OAuth flow. Operates in authenticated context.
 *
 * - Ensures `connect` param exists
 * - Validates logged-in user matches `connect` param
 *
 * @param ctx - Hono context
 * @returns connectUserId and redirectPath
 * @throws AppError if missing param or user mismatch
 */
const prepareOAuthConnect = async (ctx: Context) => {
  const connectUserId = ctx.req.query('connectUserId');

  if (!connectUserId) {
    throw new AppError({ status: 400, type: 'connect_user_not_found', severity: 'error', isRedirect: true });
  }

  const { sessionToken } = await getParsedSessionCookie(ctx, { redirectOnError: true });
  const { user } = await validateSession(sessionToken);

  if (!user) throw new AppError({ status: 404, type: 'not_found', entityType: 'user', severity: 'error', isRedirect: true });
  if (user.id !== connectUserId) throw new AppError({ status: 403, type: 'user_mismatch', severity: 'error', isRedirect: true });

  const redirectPath = '/settings#authentication';

  return { connectUserId, redirectPath };
};
/**
 * Validates and extracts verification context for an OAuth flow.
 *
 * - Ensures `token` param exists
 * - Validates token record against type `email_verification`
 * - Determines redirect path based on entity type
 *
 * @param ctx - Hono context
 * @returns tokenId + redirectPath
 * @throws AppError if missing or invalid token
 */
const prepareOAuthVerify = async (ctx: Context) => {
  const { tokenId, token } = ctx.req.query();

  // Must provide a token and tokenId
  if (!token || !tokenId) throw new AppError({ status: 400, type: 'invalid_request', severity: 'error', isRedirect: true });

  const tokenRecord = await getValidToken({ requiredType: 'email_verification', tokenId, consumeToken: false, isRedirect: true });

  // If entityType exists, proceed to invitation flow
  const redirectPath = tokenRecord.entityType ? `/invitation/${tokenRecord.token}` : appConfig.defaultRedirectPath;

  return { verifyTokenId: tokenRecord.id, redirectPath };
};
