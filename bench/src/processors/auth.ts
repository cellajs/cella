import { SESSION_COOKIE_NAME } from '../config';
import { sessionId } from '../seeds/ids';
import { hashToken, sessionToken } from '../seeds/session-auth';
import { TOTAL_USERS } from '../seeds/user.bench';

let userCounter = 0;

// ── Session cache ──────────────────────────────────────────────────────────
const cookieCache = new Map<number, string>();

function buildCookie(userIndex: number): string {
  const cached = cookieCache.get(userIndex);
  if (cached) return cached;

  const hashedToken = hashToken(sessionToken(userIndex));
  const sid = sessionId(userIndex);
  const cookie = `${SESSION_COOKIE_NAME}=${hashedToken}.${sid}.`;
  cookieCache.set(userIndex, cookie);
  return cookie;
}

// ── Authenticate ───────────────────────────────────────────────────────────

/**
 * Builds a VU's session cookie from pre-seeded deterministic tokens (`beforeScenario`
 * hook), skipping the HTTP sign-in for an instant VU start. Format
 * `{hashedToken}.{sessionId}.` where hashedToken is the SHA-256 hex of the token.
 * Must match what data-setup inserts.
 */
export async function authenticate(context: { vars: Record<string, unknown> }, _events: unknown) {
  const userIndex = userCounter++ % TOTAL_USERS;
  context.vars.cookie = buildCookie(userIndex);
  context.vars.userIndex = userIndex;
}
