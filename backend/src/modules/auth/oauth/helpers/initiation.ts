import { Env } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { getParsedSessionCookie, validateSession } from '#/modules/auth/general/helpers/session';
import { OAuthFlowType } from '#/modules/auth/oauth/schema';
import { getValidSingleUseToken } from '#/utils/get-valid-single-use-token';
import { getValidToken } from '#/utils/get-valid-token';
import { isValidRedirectPath } from '#/utils/is-redirect-url';
import { logEvent } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';
import { appConfig } from 'config';
import type { Context } from 'hono';

export interface OAuthCookiePayload {
  type: OAuthFlowType;
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
export const handleOAuthInitiation = async (
  ctx: Context<Env, any, { out: { query: { type: OAuthFlowType } } }>,
  provider: string,
  url: URL,
  state: string,
  codeVerifier?: string,
) => {
  const { type } = ctx.req.valid('query');

  const redirectPath = await prepareOAuthByContext(ctx);
  const cookieContent = JSON.stringify({ codeVerifier, type });

  await Promise.all([
    setAuthCookie(ctx, `oauth-state-${state}`, cookieContent, new TimeSpan(5, 'm')),
    setAuthCookie(ctx, 'oauth-redirect', redirectPath, new TimeSpan(5, 'm')),
  ]);

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
const prepareOAuthByContext = async (ctx: Context): Promise<string> => {
  const { type, redirect } = ctx.req.query();

  // Helper to resolve safe default redirect
  const safeRedirect = redirect ? isValidRedirectPath(decodeURIComponent(redirect)) || appConfig.defaultRedirectPath : appConfig.defaultRedirectPath;

  switch (type) {
    case 'invite': {
      const token = await getAuthCookie(ctx, 'invitation');
      if (!token) throw new AppError({ status: 400, type: 'invalid_request', severity: 'error', redirectPath: '/auth/authenticate' });

      const tokenRecord = await getValidToken({ ctx, token, tokenType: 'invitation', redirectPath: '/auth/authenticate', invokeToken: false });

      if (tokenRecord.entityType)
        return `${appConfig.backendAuthUrl}/invoke-token/${tokenRecord.type}/${tokenRecord.token}?tokenId=${tokenRecord.id}`;

      return safeRedirect;
    }

    case 'connect': {
      const { sessionToken } = await getParsedSessionCookie(ctx, { redirectOnError: '/auth/error' });
      const { user } = await validateSession(sessionToken);
      if (!user) throw new AppError({ status: 404, type: 'not_found', entityType: 'user', severity: 'error', redirectPath: '/auth/error' });

      return '/settings#authentication';
    }

    case 'verify': {
      const tokenRecord = await getValidSingleUseToken({ ctx, tokenType: 'oauth-verification', redirectPath: safeRedirect });

      if (tokenRecord) return `${appConfig.frontendUrl}/home?invitationTokenId=${tokenRecord.id}&skipWelcome=true`;

      return safeRedirect;
    }

    default:
      return safeRedirect;
  }
};
