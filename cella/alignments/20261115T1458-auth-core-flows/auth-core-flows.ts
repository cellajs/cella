/**
 * Codemod: the auth module's new layout, in import paths.
 *
 * `rewrite` maps every quoted `#/modules/auth/<old>` path of a .ts or .tsx file (imports, side-effect imports, `import()`,
 * `vi.mock`) onto its new home (`core/`, `flows/`,
 * `account/`, or the module the file left for), and `~/modules/auth/legal/` and the account-page files of `~/modules/me/`
 * onto theirs. `inventory` lists those rewrites without writing. Neither mode changes an import that already points at
 * `#/modules/auth/core`; whether a file outside the module may import a deeper path is the typecheck's and the boundary
 * test's call.
 *
 * Usage (from the repo root):
 *   pnpm exec tsx cella/alignments/<id>/auth-core-flows.ts inventory backend/src frontend/src
 *   pnpm exec tsx cella/alignments/<id>/auth-core-flows.ts rewrite   backend/src frontend/src
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.turbo', 'gen']);

/** Old import path prefix to new, most specific first; a path matches one rule. */
const RULES: readonly [from: string, to: string][] = [
  ['#/modules/auth/sessions/helpers/device-info', '#/lib/device-info'],
  ['#/modules/auth/rate-limits-db', '#/middlewares/rate-limiter/rate-limits-db'],
  ['#/modules/auth/oauth/identities-db', '#/modules/user/identities-db'],
  ['#/modules/auth/oauth/identities-queries', '#/modules/user/identities-queries'],
  ['#/modules/auth/general/operations/finish-sign-in', '#/modules/auth/flows/finish-sign-in'],
  ['#/modules/auth/step-up/helpers/step-up', '#/modules/auth/core/step-up/helpers/step-up'],
  ['#/modules/auth/step-up/operations/read-step-up', '#/modules/auth/core/step-up/operations/read-step-up'],
  ['#/modules/auth/step-up/operations/stamp-step-up', '#/modules/auth/core/step-up/operations/stamp-step-up'],
  ['#/modules/auth/step-up/operations/send-step-up-code', '#/modules/auth/flows/step-up/operations/send-step-up-code'],
  ['#/modules/auth/step-up/step-up-', '#/modules/auth/flows/step-up/step-up-'],
  ['#/modules/auth/sso/helpers/federations', '#/modules/auth/core/federations/federations'],
  ['#/modules/auth/sso/helpers/federation-keys', '#/modules/auth/core/federations/federation-keys'],
  ['#/modules/auth/sso/operations/list-sign-in-federations', '#/modules/auth/core/federations/list-sign-in-federations'],
  ['#/modules/auth/auth-events', '#/modules/auth/core/auth-events'],
  ['#/modules/me/operations/get-my-auth', '#/modules/auth/account/operations/get-my-auth'],
  ['#/modules/me/operations/toggle-mfa', '#/modules/auth/account/operations/toggle-mfa'],
  ['#/modules/me/operations/revoke-my-sessions', '#/modules/auth/account/operations/revoke-my-sessions'],
  ['~/modules/auth/legal/', '~/modules/marketing/legal/'],
  ...['passkeys-list', 'sessions-list', 'totp', 'totp-setup', 'mfa-switch', 'device-tile', 'session-tile'].map(
    (file): [string, string] => [`~/modules/me/${file}'`, `~/modules/auth/account/${file}'`],
  ),
  ...['sessions', 'devices', 'tokens', 'general', 'invitations', 'anonymous'].map(
    (dir): [string, string] => [`#/modules/auth/${dir}/`, `#/modules/auth/core/${dir}/`],
  ),
  ...['magic', 'passkeys', 'totps', 'oauth', 'mfa', 'sso'].map((dir): [string, string] => [`#/modules/auth/${dir}/`, `#/modules/auth/flows/${dir}/`]),
];

/** Every single-quoted string: a rule matches only a module path it names, so other strings pass unchanged. */
const QUOTED = /'([^']+)'/g;

/** Recursively collect .ts and .tsx files under a root, skipping generated and vendored folders. */
function collect(root: string, out: string[]): void {
  if (!statSync(root).isDirectory()) {
    out.push(root);
    return;
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(full, out);
    } else if (['.ts', '.tsx'].includes(extname(entry.name)) && !/\.(?:d|gen)\.tsx?$/.test(entry.name)) out.push(full);
  }
}

/** The new path for an import, or null when no rule names it. */
function renamed(path: string): string | null {
  // Matched with the closing quote on, so a rule that names a whole file (`…/totp'`) never catches `…/totp-setup`.
  const rule = RULES.find(([from]) => `${path}'`.startsWith(from));
  return rule ? `${path}'`.replace(rule[0], rule[1]).slice(0, -1) : null;
}

/** One file's text with its module paths rewritten, each recorded as `old -> new`. */
function rewrite(source: string, changes: string[]): string {
  return source.replace(QUOTED, (match, path: string) => {
    const next = renamed(path);
    if (!next || next === path) return match;
    changes.push(`${path} -> ${next}`);
    return `'${next}'`;
  });
}

const [mode = 'inventory', ...roots] = process.argv.slice(2);
if (!['inventory', 'rewrite'].includes(mode) || roots.length === 0) {
  console.error('Usage: auth-core-flows.ts <inventory|rewrite> <roots…>');
  process.exit(2);
}

const files: string[] = [];
for (const root of roots) collect(root, files);

let total = 0;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const changes: string[] = [];
  const next = rewrite(source, changes);
  if (changes.length === 0) continue;
  total += changes.length;
  for (const change of changes) console.log(`${mode === 'rewrite' ? 'rewrote' : 'rewrite'}  ${file}: ${change}`);
  if (mode === 'rewrite') writeFileSync(file, next);
}
console.log(`${total} import${total === 1 ? '' : 's'} ${mode === 'rewrite' ? 'rewritten' : 'to rewrite'} in ${files.length} files`);
