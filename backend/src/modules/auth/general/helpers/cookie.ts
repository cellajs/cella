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

// __Host- prefix: host-locked — no Domain attribute, so the cookie is never
// sent to (or spoofable by) other subdomains. Hono enforces Path=/ and Secure
// when the prefix option is set. Same-origin serving is what makes this
// possible: every service lives under the app origin.
const prefix = secure ? ('host' as const) : undefined;

type CookieName = TokenType | 'session' | 'totp-challenge' | 'passkey-challenge' | `oauth-state-${string}`;

/**
 * Cookies read during a cross-site top-level navigation must stay Lax:
 * - `oauth-state-*` is read on the OAuth provider's callback redirect.
 * - `invitation` / `oauth-verification` are re-read mid-chain in flows that
 *   arrive cross-site (email link → OAuth callback).
 * Everything else — the session included — is only read from same-origin
 * requests and is hardened to Strict. The connect flow's session read at the
 * OAuth callback moved into the oauth-state payload for this (see initiation.ts).
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

/** Sets an auth cookie — signed in production, plain otherwise; SameSite per `isLaxCookie`. */
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
