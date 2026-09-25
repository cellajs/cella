import { COOKIE_SECRET, SESSION_COOKIE_NAME } from '../config';
import { sessionId } from '../seeds/ids';
import { hashToken, sealSessionCookie, sessionToken } from '../seeds/session-auth';
import { TOTAL_USERS } from '../seeds/user.bench';

let userCounter = 0;

// ── Session cache ──────────────────────────────────────────────────────────
const cookieCache = new Map<number, string>();

function buildCookie(userIndex: number): string {
  const cached = cookieCache.get(userIndex);
  if (cached) return cached;

  const hashedToken = hashToken(sessionToken(userIndex));
  const sid = sessionId(userIndex);
  const value = sealSessionCookie(SESSION_COOKIE_NAME, `${hashedToken}.${sid}.`, COOKIE_SECRET, 24 * 60 * 60);
  const cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`;
  cookieCache.set(userIndex, cookie);
  return cookie;
}

/** Builds a signed VU session cookie from pre-seeded tokens so no HTTP sign-in is measured. Content `{hashedToken}.{sessionId}.`, hashedToken being the SHA-256 hex of the token, matching what data-setup inserts. */
export async function authenticate(context: { vars: Record<string, unknown> }, _events: unknown) {
  const userIndex = userCounter++ % TOTAL_USERS;
  context.vars.cookie = buildCookie(userIndex);
  context.vars.userIndex = userIndex;
}
