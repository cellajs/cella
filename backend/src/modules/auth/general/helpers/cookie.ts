import type { Context } from 'hono';
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from 'hono/cookie';
import type { CookieOptions } from 'hono/utils/cookie';
import { appConfig, type TokenType } from 'shared';
import type { Env } from '#/core/context';
import type { TimeSpan } from '#/utils/time-span';
import { env } from '../../../../env';

const isProduction = appConfig.mode === 'production';

type CookieName = TokenType | 'session' | 'totp-challenge' | 'passkey-challenge' | `oauth-state-${string}`;

/**
 * Sets an authentication cookie.
 *
 * @param ctx - Request/response context.
 * @param name - Cookie name.
 * @param content - Content to store in the cookie.
 * @param timeSpan - Duration for which the cookie is valid.
 */
export const setAuthCookie = async (ctx: Context<Env>, name: CookieName, content: string, timeSpan: TimeSpan) => {
  const versionedName = `${appConfig.slug}-${name}-${appConfig.cookieVersion}`;
  const options = {
    secure: appConfig.mode !== 'development',
    path: '/',
    domain: isProduction ? appConfig.domain : undefined,
    httpOnly: true,
    sameSite: 'lax', // Tunnel mode is same-origin (ngrok fronts Vite), so no SameSite=None branch needed
    maxAge: timeSpan.seconds(),
  } satisfies CookieOptions;
  isProduction
    ? await setSignedCookie(ctx, versionedName, content, env.COOKIE_SECRET, options)
    : setCookie(ctx, versionedName, content, options);
};

/**
 * Retrieves content from an authentication cookie.
 *
 * @param ctx - Request/response context.
 * @param name - Cookie name.
 * @returns The content stored in the cookie.
 */
export const getAuthCookie = async (ctx: Context<Env>, name: CookieName) => {
  const versionedName = `${appConfig.slug}-${name}-${appConfig.cookieVersion}`;

  const content = isProduction
    ? await getSignedCookie(ctx, env.COOKIE_SECRET, versionedName)
    : getCookie(ctx, versionedName);
  return content;
};

/**
 * Deletes an authentication cookie.
 *
 * @param ctx - Request/response context.
 * @param name - Cookie name.
 * @returns Deleted value
 */
export const deleteAuthCookie = (ctx: Context<Env>, name: CookieName) => {
  const versionedName = `${appConfig.slug}-${name}-${appConfig.cookieVersion}`;

  return deleteCookie(ctx, versionedName, {
    path: '/',
    secure: isProduction,
    domain: isProduction ? appConfig.domain : undefined,
  });
};
