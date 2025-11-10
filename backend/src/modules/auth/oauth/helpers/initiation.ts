import type { Context } from 'hono';
import z from 'zod';
import { Env } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { getParsedSessionCookie, validateSession } from '#/modules/auth/general/helpers/session';
import { oauthQuerySchema } from '#/modules/auth/oauth/schema';
import { logEvent } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';

type OAuthQueryParams = z.infer<typeof oauthQuerySchema>;
export type OAuthCookiePayload = OAuthQueryParams & {
  codeVerifier?: string;
};

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
  ctx: Context<Env, any, { out: { query: OAuthQueryParams } }>,
  provider: string,
  url: URL,
  state: string,
  codeVerifier?: string,
) => {
  const { type, redirectAfter } = ctx.req.valid('query');
  const cookieContent = JSON.stringify({ codeVerifier, type, redirectAfter });

  if (type === 'connect') {
    const { sessionToken } = await getParsedSessionCookie(ctx, { redirectOnError: '/auth/error' });
    const { user } = await validateSession(sessionToken);
    if (!user) throw new AppError({ status: 404, type: 'not_found', entityType: 'user', severity: 'error', redirectPath: '/auth/error' });
  }

  await setAuthCookie(ctx, `oauth-state-${state}`, cookieContent, new TimeSpan(5, 'm'));

  logEvent('info', 'User redirected to OAuth provider', { strategy: 'oauth', provider, type });

  return ctx.redirect(url.toString(), 302);
};
