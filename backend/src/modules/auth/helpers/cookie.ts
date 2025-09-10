import { appConfig } from 'config';
import type { Context } from 'hono';
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from 'hono/cookie';
import type { CookieOptions } from 'hono/utils/cookie';
import type { TimeSpan } from '#/utils/time-span';
import { env } from '../../../env';

const isProduction = appConfig.mode === 'production';

type CookieName = 'session' | 'confirm-mfa' | 'totp-key' | 'passkey-challenge' | `oauth-${string}`;

/**
 * Sets an authentication cookie.
 *
 * @param ctx - Request/response context.
 * @param name - Cookie name.
 * @param content - Content to store in the cookie.
 * @param timeSpan - Duration for which the cookie is valid.
 */
export const setAuthCookie = async (ctx: Context, name: CookieName, content: string, timeSpan: TimeSpan) => {
  const versionedName = `${appConfig.slug}-${name}-${appConfig.cookieVersion}`;
  const options = {
    secure: appConfig.mode !== 'development',
    path: '/',
    domain: isProduction ? appConfig.domain : undefined,
    httpOnly: true,
    sameSite: appConfig.mode === 'tunnel' ? 'none' : 'lax', // ATTENTION: Strict is possible if you use a proxy for api
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
  const versionedName = `${appConfig.slug}-${name}-${appConfig.cookieVersion}`;

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
  const versionedName = `${appConfig.slug}-${name}-${appConfig.cookieVersion}`;

  return deleteCookie(ctx, versionedName, {
    path: '/',
    secure: isProduction,
    domain: isProduction ? appConfig.domain : undefined,
  });
};
