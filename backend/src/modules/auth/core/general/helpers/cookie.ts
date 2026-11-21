import { createHmac } from 'node:crypto';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { CookieOptions } from 'hono/utils/cookie';
import { appConfig, type TokenKind } from 'shared';
import { safeEqual } from 'shared/utils/safe-equal';
import type { Env } from '#/core/context';
import { env } from '#/env';
import { isTokenKind, type LinkTokenKind, type TokenPolicy, tokenPolicies } from '#/modules/auth/core/tokens/token-policies';
import { hashToken } from '#/utils/hash-token';
import type { TimeSpan } from '#/utils/time-span';

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
  | TokenKind
  | 'session'
  | 'embedded-browser-key'
  | 'session-step-up'
  | 'device-id'
  | 'totp-challenge'
  | 'passkey-challenge'
  | 'magic-requested'
  | `${LinkTokenKind}-pending`
  | 'sso-recovery'
  | 'oauth-state';

/**
 * Cookies read on a navigation another site started stay SameSite Lax: the OAuth state, plus the device id and the
 * magic-link request marker, which the OAuth callback and emailed links must see to recognize the browser. A token
 * kind's own cookie follows its policy. All others, sessions included, are same-origin only.
 */
const laxCookies = new Set<CookieName>(['oauth-state', 'device-id', 'magic-requested']);
const isLaxCookie = (name: CookieName) => {
  if (!isTokenKind(name)) return laxCookies.has(name);
  const policy: TokenPolicy = tokenPolicies[name];
  return (policy.carrier === 'link' || policy.carrier === 'cookie') && policy.sameSite === 'lax';
};

const versionedCookieName = (name: CookieName) => `${appConfig.slug}-${name}-${appConfig.cookieVersion}`;

/** Effective wire name: hono prepends `__Host-` when the prefix option is active. */
export const authCookieName = (name: CookieName) => `${prefix === 'host' ? '__Host-' : ''}${versionedCookieName(name)}`;

/** The MAC covers the cookie's name and expiry with its content: a value signed for one cookie never reads as another. */
const cookieMac = (secret: string, versionedName: string, expiresAt: number, content: string) =>
  createHmac('sha256', secret).update(`${versionedName}\n${expiresAt}\n${content}`).digest('base64url');

/**
 * The signed wire value `<content>.<expiresAt>.<mac>`, in every mode: which cookie it is, what it holds and until when
 * are all covered, so a value handed out for one purpose, or kept past its max age, reads as nothing.
 */
export const sealAuthCookie = (name: CookieName, content: string, maxAgeSeconds: number) => {
  const versionedName = versionedCookieName(name);
  // Whole seconds: the expiry sits between dots in the sealed value, so a fraction would read back as another number.
  const expiresAt = Math.floor(Date.now() / 1000 + maxAgeSeconds);
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

  const presented = sealed.slice(macAt + 1);
  const versionedName = versionedCookieName(name);
  const macMatches = cookieSecrets.some((secret) => safeEqual(presented, cookieMac(secret, versionedName, expiresAt, content)));
  return macMatches ? content : undefined;
};

/**
 * The attributes a cookie is set and deleted with. The browser key of embedded sessions lives in another site's frame.
 * SameSite None lets the frame send it; Partitioned (CHIPS) keeps it per top-level site, only where a launch set it.
 * Both need Secure, which a browser also grants plain `http://localhost` in development.
 */
const cookieAttributes = (name: CookieName) => {
  if (name === 'embedded-browser-key') return { secure: true, sameSite: 'none', partitioned: true } as const;
  return { secure, sameSite: isLaxCookie(name) ? 'lax' : 'strict' } as const;
};

/** Sets a cookie under `cookieName` sealed as `name`, with the attributes `cookieAttributes` gives that name. */
const setSealedCookie = (ctx: Context<Env>, cookieName: string, name: CookieName, content: string, timeSpan: TimeSpan) => {
  // A lifetime measured from a stored expiry has milliseconds; the cookie and its seal both take whole seconds.
  const maxAge = Math.floor(timeSpan.seconds());
  const options = { path: '/', prefix, httpOnly: true, maxAge, ...cookieAttributes(name) } satisfies CookieOptions;
  setCookie(ctx, cookieName, sealAuthCookie(name, content, maxAge), options);
};

/** Sets a signed auth cookie, with the attributes `cookieAttributes` gives its name. */
export const setAuthCookie = (ctx: Context<Env>, name: CookieName, content: string, timeSpan: TimeSpan) =>
  setSealedCookie(ctx, versionedCookieName(name), name, content, timeSpan);

/** Reads an auth cookie's content; a missing, forged, transplanted or expired value reads as undefined. */
export const getAuthCookie = (ctx: Context, name: CookieName) => {
  const sealed = getCookie(ctx, versionedCookieName(name), prefix);
  return sealed ? openAuthCookie(name, sealed) : undefined;
};

/**
 * Each browser key of embedded sessions has a cookie of its own, named after the key's hash. Two launches that start
 * at once in one partition each set a key, and neither overwrites the other's.
 */
const browserKeyCookieName = (browserKey: string) => `${versionedCookieName('embedded-browser-key')}-${hashToken(browserKey).slice(0, 16)}`;

/** Sets or refreshes the cookie of one browser key. */
export const setBrowserKey = (ctx: Context<Env>, browserKey: string, timeSpan: TimeSpan) =>
  setSealedCookie(ctx, browserKeyCookieName(browserKey), 'embedded-browser-key', browserKey, timeSpan);

/** The browser keys a request presents, each from a cookie that opens; none outside an embedded page's partition. */
export const getBrowserKeys = (ctx: Context): string[] => {
  const family = `${authCookieName('embedded-browser-key')}-`;
  return Object.entries(getCookie(ctx)).flatMap(([cookieName, sealed]) => {
    const browserKey = cookieName.startsWith(family) ? openAuthCookie('embedded-browser-key', sealed) : undefined;
    return browserKey ? [browserKey] : [];
  });
};

/** Deletes an auth cookie: the attributes must mirror the set ones (prefix implies Path=/, Secure, no Domain), or the browser keeps it. */
export const deleteAuthCookie = (ctx: Context, name: CookieName) =>
  deleteCookie(ctx, versionedCookieName(name), { path: '/', prefix, ...cookieAttributes(name) });
