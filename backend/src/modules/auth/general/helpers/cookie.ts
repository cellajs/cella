import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { CookieOptions } from 'hono/utils/cookie';
import { appConfig, type TokenType } from 'shared';
import type { Env } from '#/core/context';
import { isTokenType, tokenPolicies } from '#/modules/auth/tokens/token-policies';
import type { TimeSpan } from '#/utils/time-span';
import { env } from '../../../../env';

/**
 * Cookie signing secrets from `COOKIE_SECRET`, one or a comma-separated list: the first signs, any verifies, so a new
 * secret can be rolled out ahead of retiring the old one. The authorization server's cookies use the same list.
 */
export const cookieSecrets = env.COOKIE_SECRET.split(',')
  .map((secret) => secret.trim())
  .filter(Boolean);

// Development runs plain http://localhost, where Secure (and so __Host-) cookies are rejected; every other mode is https.
const secure = appConfig.mode !== 'development';

// `__Host-` locks cookies to the app host: Secure, root path, no Domain attribute.
const prefix = secure ? ('host' as const) : undefined;

export type CookieName =
  | TokenType
  | 'session'
  | 'device-id'
  | 'totp-challenge'
  | 'passkey-challenge'
  | 'magic-requested'
  | 'magic-pending'
  | `oauth-state-${string}`;

/**
 * Cookies read on a navigation another site started stay SameSite Lax: the OAuth state, plus the device id and the
 * magic-link request marker, which the OAuth callback and emailed sign-in links must see to recognize the browser. A
 * token type's own cookie follows its policy. All others, sessions included, are same-origin only.
 * @see initiation.ts
 */
const isLaxCookie = (name: CookieName) =>
  isTokenType(name)
    ? tokenPolicies[name].sameSite === 'lax'
    : name === 'device-id' || name === 'magic-requested' || name.startsWith('oauth-state-');

/** Effective wire name: hono prepends `__Host-` when the prefix option is active. For consumers naming the cookie outside this helper. */
export const authCookieName = (name: CookieName) =>
  `${prefix === 'host' ? '__Host-' : ''}${appConfig.slug}-${name}-${appConfig.cookieVersion}`;

const versionedCookieName = (name: CookieName) => `${appConfig.slug}-${name}-${appConfig.cookieVersion}`;

/** The MAC covers the cookie's name and expiry with its content: a value signed for one cookie never reads as another. */
const cookieMac = (secret: string, versionedName: string, expiresAt: number, content: string) =>
  createHmac('sha256', secret).update(`${versionedName}\n${expiresAt}\n${content}`).digest('base64url');

/**
 * The signed wire value `<content>.<expiresAt>.<mac>`, in every mode: which cookie it is, what it holds and until when
 * are all covered, so a value handed out for one purpose, or kept past its max age, reads as nothing.
 */
export const sealAuthCookie = (name: CookieName, content: string, maxAgeSeconds: number) => {
  const versionedName = versionedCookieName(name);
  const expiresAt = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  return `${content}.${expiresAt}.${cookieMac(cookieSecrets[0], versionedName, expiresAt, content)}`;
};

/** The content of a sealed value, or undefined when the MAC fails for every secret or the value is past its expiry. */
const openAuthCookie = (name: CookieName, sealed: string): string | undefined => {
  const macAt = sealed.lastIndexOf('.');
  const expiresAtAt = macAt > 0 ? sealed.lastIndexOf('.', macAt - 1) : -1;
  if (expiresAtAt < 0) return undefined;

  const content = sealed.slice(0, expiresAtAt);
  const expiresAt = Number(sealed.slice(expiresAtAt + 1, macAt));
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return undefined;

  const presented = Buffer.from(sealed.slice(macAt + 1));
  const versionedName = versionedCookieName(name);
  const valid = cookieSecrets.some((secret) => {
    const expected = Buffer.from(cookieMac(secret, versionedName, expiresAt, content));
    return expected.length === presented.length && timingSafeEqual(expected, presented);
  });
  return valid ? content : undefined;
};

/** Sets a signed auth cookie; SameSite per `isLaxCookie`. */
export const setAuthCookie = async (ctx: Context<Env>, name: CookieName, content: string, timeSpan: TimeSpan) => {
  const options = {
    secure,
    path: '/',
    prefix,
    httpOnly: true,
    sameSite: isLaxCookie(name) ? 'lax' : 'strict',
    maxAge: timeSpan.seconds(),
  } satisfies CookieOptions;
  setCookie(ctx, versionedCookieName(name), sealAuthCookie(name, content, timeSpan.seconds()), options);
};

/** Reads an auth cookie's content; a missing, forged, transplanted or expired value reads as undefined. */
export const getAuthCookie = async (ctx: Context<Env>, name: CookieName) => {
  const sealed = getCookie(ctx, versionedCookieName(name), prefix);
  return sealed ? openAuthCookie(name, sealed) : undefined;
};

export const deleteAuthCookie = (ctx: Context<Env>, name: CookieName) => {
  // Must mirror the set attributes (prefix implies Path=/, Secure, no Domain), or the browser keeps the original cookie.
  return deleteCookie(ctx, versionedCookieName(name), { path: '/', secure, prefix });
};
