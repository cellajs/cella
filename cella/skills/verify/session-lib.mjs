// Shared by the browser drivers under cella/skills/: playwright from the pnpm store, and a minted session.
import { spawnSync } from 'node:child_process';
import { globSync } from 'node:fs';
import { resolve } from 'node:path';

// Playwright lives in the pnpm store (frontend devDep), not resolvable by bare import from here.
// Run from the repo root so the glob resolves.
const [pwPath] = globSync('node_modules/.pnpm/playwright@*/node_modules/playwright/index.mjs')
  .sort()
  .reverse()
  .map((p) => resolve(p));
if (!pwPath) throw new Error('No playwright under node_modules/.pnpm: run from the repo root, after pnpm install.');
export const { chromium } = await import(pwPath);

/**
 * A two-hour session for one user: the app's origin and the cookie to set. The mint script prints `<cookie name>=<signed value>`
 * and a curl line carrying the API URL, both from this checkout's config, so the cookie version and the ports (a linked
 * worktree has its own) are written down nowhere.
 */
export function mintSession(email) {
  const minted = spawnSync('pnpm', ['--silent', '--filter', 'backend', 'session:mint', email, '2'], { encoding: 'utf8' });
  const cookieMatch = /^([\w-]+-session-v\d+)=(\S+)$/m.exec(minted.stdout);
  const apiMatch = /^curl (\S+)\/me /m.exec(minted.stdout);
  if (!cookieMatch || !apiMatch) throw new Error(`Could not mint a session for ${email}:\n${minted.stdout}\n${minted.stderr}`);
  const base = new URL(apiMatch[1]).origin;
  return { base, api: apiMatch[1], cookie: { name: cookieMatch[1], value: cookieMatch[2], url: base, httpOnly: true, sameSite: 'Strict' } };
}

/**
 * Signs a minted session out, so a finished run leaves no live session in the user's sessions list. A JSON content type
 * passes the CSRF check without an Origin header. A stack that is already down leaves the session to expire.
 */
export async function endSession(session) {
  if (!session) return;
  const headers = { cookie: `${session.cookie.name}=${session.cookie.value}`, 'content-type': 'application/json' };
  await fetch(`${session.api}/auth/sign-out`, { method: 'POST', headers }).catch(() => {});
}
