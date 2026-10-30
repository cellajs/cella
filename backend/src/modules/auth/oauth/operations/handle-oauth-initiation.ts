import { AppError } from '#/core/error';
import { setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import type { OAuthCookiePayload, OAuthStartContext } from '#/modules/auth/oauth/oauth-schema';
import { resolveSession } from '#/modules/auth/sessions/operations/resolve-session';
import { readBoundToken } from '#/modules/auth/tokens/token-lifecycle';
import { log } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';

/** One round trip a start hands over: the provider URL, and what the callback must find in the state cookie. */
type OAuthInitiation = Pick<OAuthCookiePayload, 'state' | 'provider' | 'codeVerifier' | 'nonce' | 'connectionId'> & { url: URL };

/**
 * Starts a provider or federation round trip: stores its `state` and flow context (invite, connect, verify, or
 * default) in the state cookie and redirects to the provider. The state is the CSRF check; the cookie can carry a PKCE
 * `codeVerifier`, an OIDC `nonce` and an SSO start's connection. It never names a user: a connect goes to the account
 * its `oauth-connect` pin names, spent at the callback. A browser holds one state cookie, which each start replaces,
 * so starts that another site triggers over and over cannot grow the request past the server's header limit.
 * @throws AppError 401 for a connect or a verify whose pin or token this browser does not hold.
 */
export const handleOAuthInitiation = async (ctx: OAuthStartContext, { provider, url, state, codeVerifier, nonce, connectionId }: OAuthInitiation) => {
  const { type, redirectAfter } = ctx.req.valid('query');
  const cookieContent: OAuthCookiePayload = { state, provider, codeVerifier, nonce, type, redirectAfter, connectionId };

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

  setAuthCookie(ctx, 'oauth-state', stringifiedContent, new TimeSpan(5, 'm'));

  log.info('User redirected to OAuth provider', { strategy: 'oauth', provider, type });

  return ctx.redirect(url.toString(), 302);
};
