import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { getAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { type OAuthCookiePayload, oauthCookiePayloadSchema } from '#/modules/auth/oauth/oauth-schema';

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
