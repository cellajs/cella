import { appConfig } from 'config';
import type { Context } from 'hono';
import { Env } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { getParsedSessionCookie, validateSession } from '#/modules/auth/general/helpers/session';
import { getValidSingleUseToken } from '#/utils/get-valid-single-use-token';
import { getValidToken } from '#/utils/get-valid-token';
import { isValidRedirectPath } from '#/utils/is-redirect-url';
import { logEvent } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';

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
export const handleOAuthInitiation = async (ctx: Context<Env>, provider: string, url: URL, state: string, codeVerifier?: string) => {
  const { type } = ctx.req.query();

  const { redirectPath } = await prepareOAuthByContext(ctx);
  const cookieContent = JSON.stringify({ redirectPath, codeVerifier });

  // TODO state in name? perhaps in content instead? reconsider cookie lifecycle security
  await setAuthCookie(ctx, `oauth_${state}`, cookieContent, new TimeSpan(5, 'm'));

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
const prepareOAuthByContext = async (ctx: Context<Env>) => {
  const { type, redirect } = ctx.req.query();

  // default payload
  let redirectPath = resolveOAuthRedirect(redirect);

  switch (type) {
    case 'invite': {
      ({ redirectPath } = await prepareOAuthAcceptInvite(ctx));
      break;
    }
    case 'connect': {
      ({ redirectPath } = await prepareOAuthConnect(ctx));
      break;
    }
    case 'verify': {
      ({ redirectPath } = await prepareOAuthVerify(ctx));
      break;
    }
    default:
      break;
  }

  return { redirectPath };
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
 * @returns redirectPath
 * @throws AppError if token is missing or invalid
 */
const prepareOAuthAcceptInvite = async (ctx: Context<Env>) => {
  const token = await getAuthCookie(ctx, 'invitation');

  // Must provide a token and tokenId
  if (!token) throw new AppError({ status: 400, type: 'invalid_request', severity: 'error', redirectPath: '/auth/authenticate' });

  const tokenRecord = await getValidToken({ ctx, token, invokeToken: false, tokenType: 'invitation', redirectPath: '/auth/authenticate' });

  const redirectPath = tokenRecord.entityType
    ? `${appConfig.backendAuthUrl}/invoke-token/${tokenRecord.type}/${tokenRecord.token}`
    : appConfig.defaultRedirectPath;

  return { redirectPath };
};

/**
 * Connect an provider account such as your Github account to your existing account.
 * Can only be done from within an authenticated context.
 *
 * @param ctx - Hono context
 * @returns connectUserId and redirectPath
 * @throws AppError if missing param or user mismatch
 */
const prepareOAuthConnect = async (ctx: Context<Env>) => {
  const { sessionToken } = await getParsedSessionCookie(ctx, { redirectOnError: '/auth/authenticate' });

  // Get user from valid session
  const { user } = await validateSession(sessionToken);
  if (!user) throw new AppError({ status: 404, type: 'not_found', entityType: 'user', severity: 'error', redirectPath: '/auth/authenticate' });

  //TODO we do this on callback or not?
  const redirectPath = '/settings#authentication';

  return { connectUserId: user.id, redirectPath };
};
/**
 * Validates single-use token from cookie and revokes it to redirect back to frontend on success.
 *
 * @param ctx - Hono context
 * @returns tokenId + redirectPath
 * @throws AppError if missing or invalid token
 */
const prepareOAuthVerify = async (ctx: Context<Env>) => {
  // Validate single use token from db
  const tokenRecord = await getValidSingleUseToken({ ctx, tokenType: 'oauth-verification', redirectPath: '/auth/authenticate' });

  // Revoke single use token by deleting cookie
  deleteAuthCookie(ctx, 'oauth-verification');

  let redirectPath = appConfig.defaultRedirectPath;

  // If its a membership invitation
  if (tokenRecord.entityType) redirectPath = `${appConfig.frontendUrl}/home?invitationTokenId=${tokenRecord.id}&skipWelcome=true`;

  return { verifyTokenId: tokenRecord.id, redirectPath };
};
