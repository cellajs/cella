import { config } from 'config';
import type { Context } from 'hono';
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from 'hono/cookie';
import type { CookieOptions } from 'hono/utils/cookie';
import type { TimeSpan } from '#/utils/time-span';
import { env } from '../../../env';

const isProduction = config.mode === 'production';

export type CookieName =
  | 'session'
  | 'oauth_state'
  | 'oauth_code_verifier'
  | 'oauth_redirect'
  | 'oauth_connect_user_id'
  | 'oauth_invite_token'
  | 'passkey_challenge';

/**
 * Sets an authentication cookie.
 *
 * @param ctx - Request/response context.
 * @param name - Cookie name.
 * @param content - Content to store in the cookie.
 * @param timeSpan - Duration for which the cookie is valid.
 */
export const setAuthCookie = async (ctx: Context, name: CookieName, content: string, timeSpan: TimeSpan) => {
  const versionedName = `${config.slug}-${name}-${config.cookieVersion}`;
  const options = {
    secure: isProduction,
    path: '/',
    domain: isProduction ? config.domain : undefined,
    httpOnly: true,
    sameSite: isProduction ? 'lax' : 'lax', // ATTENTION: Strict is possible if you use a proxy for api
    maxAge: timeSpan.seconds(),
  } satisfies CookieOptions;
  isProduction ? await setSignedCookie(ctx, versionedName, content, env.COOKIE_SECRET, options) : setCookie(ctx, versionedName, content, options);
};

/**
 * Retrieves content from an authentication cookie.
 *
 * @param ctx - Request/response context.
 * @param name - Cookie name.
 * @returns The content stored in the cookie.
 */
export const getAuthCookie = async (ctx: Context, name: CookieName) => {
  const versionedName = `${config.slug}-${name}-${config.cookieVersion}`;

  const content = isProduction ? await getSignedCookie(ctx, env.COOKIE_SECRET, versionedName) : getCookie(ctx, versionedName);
  return content;
};

/**
 * Deletes an authentication cookie.
 *
 * @param ctx - Request/response context.
 * @param name - Cookie name.
 * @returns Deleted value
 */
export const deleteAuthCookie = (ctx: Context, name: CookieName) => {
  const versionedName = `${config.slug}-${name}-${config.cookieVersion}`;

  return deleteCookie(ctx, versionedName, {
    path: '/',
    secure: isProduction,
    domain: isProduction ? config.domain : undefined,
  });
};
