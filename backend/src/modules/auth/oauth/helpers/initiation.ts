import type { Context } from 'hono';
import { appConfig } from 'shared';
import z from 'zod';
import { Env } from '#/lib/context';
import { AppError, type ErrorKey } from '#/lib/error';
import { setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { getParsedSessionCookie, validateSession } from '#/modules/auth/general/helpers/session';
import { type OAuthCookiePayload, oauthCookiePayloadSchema, oauthQuerySchema } from '#/modules/auth/oauth/oauth-schema';
import { getValidSingleUseToken } from '#/utils/get-valid-single-use-token';
import { logEvent } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';

type OAuthQueryParams = z.infer<typeof oauthQuerySchema>;

/**
 * Parse and validate an OAuth cookie payload using Zod schema.
 * Returns null if the cookie is missing, malformed, or fails validation.
 */
export const parseOAuthCookie = (raw: string | false | null | undefined): OAuthCookiePayload | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const result = oauthCookiePayloadSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
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
  const cookieContent = { codeVerifier, type, redirectAfter };

  if (type === 'connect') {
    try {
      const { sessionToken } = await getParsedSessionCookie(ctx);
      const { user } = await validateSession(sessionToken);
      if (!user) throw new AppError(404, 'not_found', 'error', { entityType: 'user' });
    } catch (err) {
      if (err instanceof AppError) {
        throw new AppError(err.status, err.type as ErrorKey, err.severity, {
          willRedirect: appConfig.mode !== 'test',
          meta: { ...err.meta, errorPagePath: '/auth/error' },
        });
      }
      throw err;
    }
  }

  if (type === 'verify') {
    const tokenRecord = await getValidSingleUseToken({ ctx, tokenType: 'oauth-verification' });
    if (tokenRecord && redirectAfter) {
      try {
        const redirectUrl = new URL(redirectAfter, appConfig.frontendUrl);
        if (redirectUrl.pathname.includes('home')) {
          redirectUrl.searchParams.set('skipWelcome', 'true');
          cookieContent.redirectAfter = redirectUrl.pathname + redirectUrl.search + redirectUrl.hash;
        }
      } catch (_) {} // fallback if redirectAfter is not a valid URL
    }
  }

  const stringifiedContent = JSON.stringify(cookieContent);

  await setAuthCookie(ctx, `oauth-state-${state}`, stringifiedContent, new TimeSpan(5, 'm'));

  logEvent('info', 'User redirected to OAuth provider', { strategy: 'oauth', provider, type });

  return ctx.redirect(url.toString(), 302);
};
