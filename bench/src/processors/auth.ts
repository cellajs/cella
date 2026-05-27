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
import { createHash } from 'node:crypto';
import { SESSION_COOKIE_NAME } from '../config';
import { sessionId } from '../generators/ids';

let userCounter = 0;

/** Deterministic session token per user index — must match data-setup.ts. */
function sessionToken(index: number): string {
  return `xbench-session-token-${String(index).padStart(12, '0')}`;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

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

export async function authenticate(
  context: { vars: Record<string, unknown> },
  _events: unknown,
) {
  const userIndex = userCounter++ % 1200;
  context.vars.cookie = buildCookie(userIndex);
  context.vars.userIndex = userIndex;
}
