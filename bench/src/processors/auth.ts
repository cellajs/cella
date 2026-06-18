/**
 * Artillery auth processor — uses pre-seeded sessions.
 *
 * Used as `beforeScenario` in all scenarios. Builds the session cookie
 * directly from deterministic tokens seeded by data-setup.ts — no HTTP
 * sign-in call, instant VU start.
 *
 * The token format matches what data-setup inserts:
 *   cookie = "{hashedToken}.{sessionId}."
 * where hashedToken = SHA-256 hex of the deterministic token string.
 */
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

export async function authenticate(context: { vars: Record<string, unknown> }, _events: unknown) {
  const userIndex = userCounter++ % TOTAL_USERS;
  context.vars.cookie = buildCookie(userIndex);
  context.vars.userIndex = userIndex;
}
