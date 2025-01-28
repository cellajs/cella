import { config } from 'config';
import type { Context } from 'hono';
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from 'hono/cookie';
import type { CookieOptions } from 'hono/utils/cookie';
import type { TimeSpan } from '#/utils/time-span';
import { env } from '../../../../env';

const isProduction = config.mode === 'production';

export type CookieName =
  | 'session'
  | 'oauth_state'
  | 'oauth_code_verifier'
  | 'oauth_redirect'
  | 'passkey_challenge'
  | 'oauth_connect'
  | 'oauth_invite_token';

// Set auth cookie (to store content such as session id or oauth state)
export const setAuthCookie = async (ctx: Context, name: CookieName, content: string, timeSpan: TimeSpan) => {
  const versionedName = `${config.slug}-${name}-${config.cookieVersion}`;
  const options = {
    secure: isProduction,
    path: '/',
    domain: isProduction ? config.domain : undefined,
    httpOnly: true,
    sameSite: isProduction ? 'lax' : 'lax', // TODO: Strict is possible once we use a proxy for api
    maxAge: timeSpan.seconds(),
  } satisfies CookieOptions;
  isProduction ? await setSignedCookie(ctx, versionedName, content, env.COOKIE_SECRET, options) : setCookie(ctx, versionedName, content, options);
};

// Get content from an auth cookie
export const getAuthCookie = async (ctx: Context, name: CookieName) => {
  const versionedName = `${config.slug}-${name}-${config.cookieVersion}`;
  const content = isProduction ? await getSignedCookie(ctx, env.COOKIE_SECRET, versionedName) : getCookie(ctx, versionedName);
  return content;
};

// Delete session cookie
export const deleteAuthCookie = (ctx: Context, name: CookieName) => {
  const versionedName = `${config.slug}-${name}-${config.cookieVersion}`;
  deleteCookie(ctx, versionedName, {
    path: '/',
    secure: isProduction,
    domain: isProduction ? config.domain : undefined,
  });
};
