import type { Context } from 'hono';
import type z from 'zod';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import type { OAuthCookiePayload, oauthQuerySchema } from '#/modules/auth/oauth/oauth-schema';
import { resolveSession } from '#/modules/auth/sessions/operations/resolve-session';
import { readBoundToken } from '#/modules/auth/tokens/token-lifecycle';
import { log } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';

type OAuthQueryParams = z.infer<typeof oauthQuerySchema>;

/**
 * Creates an OAuth session: stores the flow context (invite, connect, verify, or default) in cookies and redirects to the provider.
 * The context is tied to the OAuth `state` to prevent CSRF and can carry a PKCE `codeVerifier` and an OIDC `nonce`. It
 * never names a user: a connect goes to the account its `oauth-connect` pin names, spent at the callback.
 */
export const handleOAuthInitiation = async (
  ctx: Context<Env, string, { out: { query: OAuthQueryParams } }>,
  provider: OAuthCookiePayload['provider'],
  url: URL,
  state: string,
  codeVerifier?: string,
  nonce?: string,
) => {
  const { type, redirectAfter } = ctx.req.valid('query');
  const cookieContent: OAuthCookiePayload = { provider, codeVerifier, nonce, type, redirectAfter };

  if (type === 'connect') {
    // A connect starts from the account page, which explains its refusals.
    ctx.set('errorPagePath', '/account');
    // Fails early without the pin, or with one that another session in this browser started.
    const [pin, { user, session }] = await Promise.all([readBoundToken(ctx, 'oauth-connect'), resolveSession(ctx)]);
    if (pin.userId !== user.id || pin.sessionId !== session.id) {
      throw new AppError(401, 'oauth-connect_not_found', 'warn');
    }
  }

  if (type === 'verify') {
    // Fails early on a missing or expired verification token; the callback re-validates. The post-auth redirect travels on the token row.
    const tokenRecord = await readBoundToken(ctx, 'oauth-verification');
    cookieContent.redirectAfter = tokenRecord.redirectPath ?? undefined;
  }

  const stringifiedContent = JSON.stringify(cookieContent);

  await setAuthCookie(ctx, `oauth-state-${state}`, stringifiedContent, new TimeSpan(5, 'm'));

  log.info('User redirected to OAuth provider', { strategy: 'oauth', provider, type });

  return ctx.redirect(url.toString(), 302);
};
