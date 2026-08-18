import type { Context } from 'hono';
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from 'hono/cookie';
import type { CookieOptions } from 'hono/utils/cookie';
import { appConfig, type TokenType } from 'shared';
import type { Env } from '#/core/context';
import type { TimeSpan } from '#/utils/time-span';
import { env } from '../../../../env';

const isProduction = appConfig.mode === 'production';

// Development runs plain http://localhost, where Secure (and so __Host-) cookies are rejected; every other mode is https.
const secure = appConfig.mode !== 'development';

// `__Host-` locks cookies to the app host: Secure, root path, no Domain attribute.
const prefix = secure ? ('host' as const) : undefined;

type CookieName =
  | TokenType
  | 'session'
  | 'device-id'
  | 'totp-challenge'
  | 'passkey-challenge'
  | `oauth-state-${string}`;

/**
 * Cookies needed during cross-site OAuth and invitation redirects stay SameSite Lax; all others, sessions included, are same-origin only.
 * @see initiation.ts
 */
const isLaxCookie = (name: CookieName) =>
  name === 'invitation' || name === 'oauth-verification' || name.startsWith('oauth-state-');

/** Effective wire name: hono prepends `__Host-` when the prefix option is active. For consumers naming the cookie outside this helper. */
export const authCookieName = (name: CookieName) =>
  `${prefix === 'host' ? '__Host-' : ''}${appConfig.slug}-${name}-${appConfig.cookieVersion}`;

/** Sets an auth cookie, signed in production and plain otherwise; SameSite per `isLaxCookie`. */
export const setAuthCookie = async (ctx: Context<Env>, name: CookieName, content: string, timeSpan: TimeSpan) => {
  const versionedName = `${appConfig.slug}-${name}-${appConfig.cookieVersion}`;
  const options = {
    secure,
    path: '/',
    prefix,
    httpOnly: true,
    sameSite: isLaxCookie(name) ? 'lax' : 'strict',
    maxAge: timeSpan.seconds(),
  } satisfies CookieOptions;
  isProduction
    ? await setSignedCookie(ctx, versionedName, content, env.COOKIE_SECRET, options)
    : setCookie(ctx, versionedName, content, options);
};

/** Reads (and, in production, unsigns) an auth cookie's content. */
export const getAuthCookie = async (ctx: Context<Env>, name: CookieName) => {
  const versionedName = `${appConfig.slug}-${name}-${appConfig.cookieVersion}`;

  const content = isProduction
    ? await getSignedCookie(ctx, env.COOKIE_SECRET, versionedName, prefix)
    : getCookie(ctx, versionedName, prefix);
  return content;
};

export const deleteAuthCookie = (ctx: Context<Env>, name: CookieName) => {
  const versionedName = `${appConfig.slug}-${name}-${appConfig.cookieVersion}`;

  // Must mirror the set attributes (prefix implies Path=/, Secure, no Domain), or the browser keeps the original cookie.
  return deleteCookie(ctx, versionedName, { path: '/', secure, prefix });
};
