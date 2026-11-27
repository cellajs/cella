import { createHmac } from 'node:crypto';

/** Deterministic session token per user index. */
export function sessionToken(index: number): string {
  return `xbench-session-token-${String(index).padStart(12, '0')}`;
}

/** The stored hash of `token`, matching backend's `hashToken`: HMAC-SHA-256 hex under `DATA_HASH_SECRET`. */
export function hashToken(token: string, dataHashSecret: string): string {
  return createHmac('sha256', dataHashSecret).update(`token\n${token}`, 'utf8').digest('hex');
}

/**
 * A signed session cookie value, in the format of `sealAuthCookie` (backend/src/modules/auth/general/helpers/cookie.ts):
 * `<content>.<expiresAt>.<mac>`, the MAC covering the versioned cookie name, the expiry and the content. The app signs
 * cookies in every mode, so an unsigned one never authenticates. Signed with the first `COOKIE_SECRET` entry.
 */
export function sealSessionCookie(versionedName: string, content: string, cookieSecret: string, maxAgeSeconds: number): string {
  const secret = cookieSecret.split(',')[0].trim();
  const expiresAt = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const mac = createHmac('sha256', secret).update(`${versionedName}\n${expiresAt}\n${content}`).digest('base64url');
  return `${content}.${expiresAt}.${mac}`;
}
