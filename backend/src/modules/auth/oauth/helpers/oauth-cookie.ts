import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { type CookieName, deleteAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { readJsonCookie } from '#/modules/auth/general/helpers/read-json-cookie';
import { type OAuthCookiePayload, oauthCookiePayloadSchema } from '#/modules/auth/oauth/oauth-schema';

/**
 * The state cookie a callback resumes, or null when it is missing or unreadable. A state serves one round trip, so the
 * cookie is deleted once read. A connect's refusals from this read on go back to the account page, the provider's own
 * and a failed code exchange included.
 */
export const readOAuthCookie = async (ctx: Context<Env>, state: string): Promise<OAuthCookiePayload | null> => {
  if (!state) return null;

  const name: CookieName = `oauth-state-${state}`;
  const payload = await readJsonCookie(ctx, name, oauthCookiePayloadSchema);
  if (!payload) return null;

  deleteAuthCookie(ctx, name);
  if (payload.type === 'connect') ctx.set('errorPagePath', '/account');
  return payload;
};
