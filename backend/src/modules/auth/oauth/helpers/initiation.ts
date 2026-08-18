import type { Context } from 'hono';
import { appConfig } from 'shared';
import type z from 'zod';
import type { Env } from '#/core/context';
import { AppError, type ErrorKey } from '#/core/error';
import { setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { getParsedSessionCookie, validateSession } from '#/modules/auth/general/helpers/session';
import type { OAuthCookiePayload, oauthQuerySchema } from '#/modules/auth/oauth/oauth-schema';
import { oauthCookiePayloadSchema } from '#/modules/auth/oauth/oauth-schema';
import { getValidSingleUseToken } from '#/utils/get-valid-single-use-token';
import { log } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';

type OAuthQueryParams = z.infer<typeof oauthQuerySchema>;

/** Returns null when the cookie is missing, malformed, or fails schema validation. */
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
 * Creates an OAuth session: stores the flow context (invite, connect, verify, or default) in cookies and redirects to the provider.
 * The context is tied to the OAuth `state` to prevent CSRF and can carry a PKCE `codeVerifier` and an OIDC `nonce`.
 */
export const handleOAuthInitiation = async (
  ctx: Context<Env, string, { out: { query: OAuthQueryParams } }>,
  provider: string,
  url: URL,
  state: string,
  codeVerifier?: string,
  nonce?: string,
) => {
  const { type, redirectAfter } = ctx.req.valid('query');
  const cookieContent: OAuthCookiePayload = { codeVerifier, nonce, type, redirectAfter };

  if (type === 'connect') {
    try {
      const { sessionToken } = await getParsedSessionCookie(ctx);
      const { user } = await validateSession(sessionToken);
      if (!user) throw new AppError(404, 'not_found', 'error', { entityType: 'user' });
      // Pin the connecting user in the signed state payload: the SameSite=Strict session cookie is absent on the cross-site callback.
      cookieContent.connectUserId = user.id;
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
    // Fails early on a missing or expired verification token; the callback re-validates. The post-auth redirect travels on the token row.
    const tokenRecord = await getValidSingleUseToken({ ctx, tokenType: 'oauth-verification' });
    cookieContent.redirectAfter = tokenRecord.redirectPath ?? undefined;
  }

  const stringifiedContent = JSON.stringify(cookieContent);

  await setAuthCookie(ctx, `oauth-state-${state}`, stringifiedContent, new TimeSpan(5, 'm'));

  log.info('User redirected to OAuth provider', { strategy: 'oauth', provider, type });

  return ctx.redirect(url.toString(), 302);
};
