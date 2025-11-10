import { appConfig } from 'config';
import type { Context } from 'hono';
import { Env } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { getParsedSessionCookie, validateSession } from '#/modules/auth/general/helpers/session';
import { OAuthFlowType } from '#/modules/auth/oauth/schema';
import { getValidSingleUseToken } from '#/utils/get-valid-single-use-token';
import { isValidRedirectPath } from '#/utils/is-redirect-url';
import { logEvent } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';

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
  ctx: Context<Env, any, { out: { query: { type: OAuthFlowType; redirect?: string } } }>,
  provider: string,
  url: URL,
  state: string,
  codeVerifier?: string,
) => {
  const { type, redirect } = ctx.req.valid('query');

  const redirectPath = await prepareOAuthByContext(ctx, type, redirect);
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
 * - invite → sets invite redirect
 * - connect → validates connecting user session, sets connection redirect
 * - verify → validates email verification token, sets verify redirect
 * - auth (default) → sets default redirect
 *
 * @param ctx - Hono request/response context
 * @param type - OAuth flow type
 * @param redirect - Optional redirect URL parameter
 * @returns normalized redirect URL for the OAuth flow
 */
const prepareOAuthByContext = async (ctx: Context, type: OAuthFlowType, redirect?: string): Promise<string> => {
  const safeRedirectPath = redirect
    ? isValidRedirectPath(decodeURIComponent(redirect)) || appConfig.defaultRedirectPath
    : appConfig.defaultRedirectPath;

  switch (type) {
    case 'invite':
      return safeRedirectPath;

    case 'connect': {
      const { sessionToken } = await getParsedSessionCookie(ctx, { redirectOnError: '/auth/error' });
      const { user } = await validateSession(sessionToken);
      if (!user) throw new AppError({ status: 404, type: 'not_found', entityType: 'user', severity: 'error', redirectPath: '/auth/error' });

      return safeRedirectPath;
    }

    case 'verify': {
      const tokenRecord = await getValidSingleUseToken({ ctx, tokenType: 'oauth-verification', redirectPath: safeRedirectPath });
      if (tokenRecord && safeRedirectPath === appConfig.defaultRedirectPath) {
        return `${safeRedirectPath}?skipWelcome=true`;
      }

      return safeRedirectPath;
    }

    default:
      return safeRedirectPath;
  }
};
