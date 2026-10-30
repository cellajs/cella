import type { Context } from 'hono';
import { safeEqual } from 'shared/utils/safe-equal';
import type { Env } from '#/core/context';
import { deleteAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { readJsonCookie } from '#/modules/auth/general/helpers/read-json-cookie';
import { type OAuthCookiePayload, oauthCookiePayloadSchema } from '#/modules/auth/oauth/oauth-schema';

/**
 * The state cookie a callback resumes, or null when it is missing, unreadable or holds another round trip's state (an
 * earlier start's callback after a newer start). A state serves one round trip, so the cookie is deleted once its state
 * matches. A callback reads it before it judges the provider's answer: a connect's refusals from this read on go back
 * to the account page, the provider's own and a failed code exchange included.
 */
export const readOAuthCookie = (ctx: Context<Env>, state: string): OAuthCookiePayload | null => {
  if (!state) return null;

  const payload = readJsonCookie(ctx, 'oauth-state', oauthCookiePayloadSchema);
  if (!payload || !safeEqual(payload.state, state)) return null;

  deleteAuthCookie(ctx, 'oauth-state');
  if (payload.type === 'connect') ctx.set('errorPagePath', '/account');
  return payload;
};
