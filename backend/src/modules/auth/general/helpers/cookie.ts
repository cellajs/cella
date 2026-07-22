import type { Context } from 'hono';
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from 'hono/cookie';
import type { CookieOptions } from 'hono/utils/cookie';
import { appConfig, type TokenType } from 'shared';
import type { Env } from '#/core/context';
import type { TimeSpan } from '#/utils/time-span';
import { env } from '../../../../env';

const isProduction = appConfig.mode === 'production';

// Development runs over plain http://localhost, where Secure (and therefore
// __Host-) cookies are rejected by some browsers; every other mode is https.
const secure = appConfig.mode !== 'development';

// `__Host-` locks cookies to the app host with Secure, root path, and no Domain attribute.
// Same-origin service paths make this isolation possible.
const prefix = secure ? ('host' as const) : undefined;

type CookieName =
  | TokenType
  | 'session'
  | 'device-id'
  | 'totp-challenge'
  | 'passkey-challenge'
  | `oauth-state-${string}`;

/**
 * Keeps cookies required during cross-site OAuth and invitation redirects at SameSite Lax.
 * All other cookies, including sessions, are restricted to same-origin requests.
 * @see initiation.ts
 */
const isLaxCookie = (name: CookieName) =>
  name === 'invitation' || name === 'oauth-verification' || name.startsWith('oauth-state-');

/**
 * Effective wire name of an auth cookie: hono prepends `__Host-` when the
 * prefix option is active. For consumers that name the cookie outside this
 * helper (OpenAPI security scheme, tests).
 */
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

/** Deletes an auth cookie. */
export const deleteAuthCookie = (ctx: Context<Env>, name: CookieName) => {
  const versionedName = `${appConfig.slug}-${name}-${appConfig.cookieVersion}`;

  // Must mirror the set attributes (prefix implies Path=/, Secure, no Domain),
  // or the browser treats it as a different cookie and keeps the original.
  return deleteCookie(ctx, versionedName, { path: '/', secure, prefix });
};
