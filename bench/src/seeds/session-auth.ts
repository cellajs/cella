import { createHash, createHmac } from 'node:crypto';

/** Deterministic session token per user index. */
export function sessionToken(index: number): string {
  return `xbench-session-token-${String(index).padStart(12, '0')}`;
}

/** SHA-256 hex lowercase, matching backend's hashToken (node:crypto). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * A signed session cookie value, in the format of `sealAuthCookie` (backend/src/modules/auth/general/helpers/cookie.ts):
 * `<content>.<expiresAt>.<mac>`, the MAC covering the versioned cookie name, the expiry and the content. The app signs
 * cookies in every mode, so an unsigned one never authenticates. Signed with the first `COOKIE_SECRET` entry.
 */
export function sealSessionCookie(
  versionedName: string,
  content: string,
  cookieSecret: string,
  maxAgeSeconds: number,
): string {
  const secret = cookieSecret.split(',')[0].trim();
  const expiresAt = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const mac = createHmac('sha256', secret).update(`${versionedName}\n${expiresAt}\n${content}`).digest('base64url');
  return `${content}.${expiresAt}.${mac}`;
}
