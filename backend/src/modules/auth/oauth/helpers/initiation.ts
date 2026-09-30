import type { Context } from 'hono';
import type z from 'zod';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { resolveSession } from '#/modules/auth/general/helpers/session';
import type { OAuthCookiePayload, oauthQuerySchema } from '#/modules/auth/oauth/oauth-schema';
import { oauthCookiePayloadSchema } from '#/modules/auth/oauth/oauth-schema';
import { readBoundToken } from '#/modules/auth/tokens/token-lifecycle';
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
 * The state cookie a callback resumes, or null when it is missing or unreadable. A connect's refusals from this read
 * on go back to the account page, the provider's own and a failed code exchange included.
 */
export const readOAuthCookie = async (ctx: Context<Env>, state: string): Promise<OAuthCookiePayload | null> => {
  const payload = state ? parseOAuthCookie(await getAuthCookie(ctx, `oauth-state-${state}`)) : null;
  if (payload?.type === 'connect') ctx.set('errorPagePath', '/account');
  return payload;
};

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
