// Shared by the drivers in this folder: playwright, a minted session, and the attachments table and description editor helpers.
import { spawnSync } from 'node:child_process';
import { globSync } from 'node:fs';
import { resolve } from 'node:path';

// Playwright lives in the pnpm store (frontend devDep), not resolvable by bare import from here.
// Run from the repo root so the glob resolves.
const [pwPath] = globSync('node_modules/.pnpm/playwright@*/node_modules/playwright/index.mjs').sort().reverse().map((p) => resolve(p));
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

// Exact name: bench rows are numbered, so "… 2" is also the start of "… 20" and "… 201".
export const exactText = (text) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
export const rowByName = (page, name) => page.locator('.rdg-row').filter({ has: page.locator('span.truncate.font-medium', { hasText: exactText(name) }) });

// Remote cursor labels sit inside the editor's text, so they are cut before matching.
export const editorText = (editor) =>
  editor.evaluate((el) => {
    const copy = el.cloneNode(true);
    for (const cursor of copy.querySelectorAll('.bn-collaboration-cursor__base')) cursor.remove();
    return copy.textContent ?? '';
  });

/** Puts the caret at the document end. The editor reads a moved caret a moment later; text typed at once goes to the old one. */
export async function caretToEnd(page, editor) {
  await editor.evaluate((el) => {
    el.focus();
    const selection = getSelection();
    selection.selectAllChildren(el);
    selection.collapseToEnd();
  });
  await page.waitForTimeout(150);
}
