import { COOKIE_SECRET, SESSION_COOKIE_NAME } from '../config';
import { sealSessionCookie, sessionToken } from '../seeds/session-auth';
import { TOTAL_USERS } from '../seeds/user.bench';

let userCounter = 0;

// ── Session cache ──────────────────────────────────────────────────────────
const cookieCache = new Map<number, string>();

function buildCookie(userIndex: number): string {
  const cached = cookieCache.get(userIndex);
  if (cached) return cached;

  const value = sealSessionCookie(SESSION_COOKIE_NAME, sessionToken(userIndex), COOKIE_SECRET, 24 * 60 * 60);
  const cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`;
  cookieCache.set(userIndex, cookie);
  return cookie;
}

/** Builds a signed VU session cookie from pre-seeded tokens so no HTTP sign-in is measured. It carries the raw token; data-setup stores its SHA-256 hex, as a sign-in does. */
export async function authenticate(context: { vars: Record<string, unknown> }, _events: unknown) {
  const userIndex = userCounter++ % TOTAL_USERS;
  context.vars.cookie = buildCookie(userIndex);
  context.vars.userIndex = userIndex;
}
