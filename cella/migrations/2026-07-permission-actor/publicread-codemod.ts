/**
 * Public-read mode codemod for the cella permission overhaul.
 *
 * The engine collapsed public read to a single mode: `publicRead('publicSelf')`. The parent-cascade
 * modes `publicParent` and `publicParentOrSelf` are REMOVED (they cannot be enforced in collection
 * SQL or CDC dispatch, which only ever see the row itself — see the folder README).
 *
 * This rewrites those calls to `publicSelf` and REPORTS each one, because the rewrite is
 * SEMANTICALLY LOSSY: an entity that was public because its PARENT was public will, afterwards, be
 * public only when ITS OWN `publicAt` is set. For every reported entity you must either
 *   (a) denormalize `publicAt` onto its rows — populate on parent-publish + backfill existing rows
 *       (see `publicat-cascade.template.sql` in this folder), or
 *   (b) accept that it is no longer publicly readable via its parent.
 * Do NOT skip the report: a silent rewrite turns a live public-share feature into 403s.
 *
 * Modes:
 *   inventory — report only, no writes — RUN THIS FIRST
 *   rewrite   — apply the mode rewrite
 *
 * Usage (from repo root):
 *   pnpm exec tsx cella/migrations/2026-07-permission-actor/publicread-codemod.ts inventory shared/config/permissions-config.ts
 *   pnpm exec tsx cella/migrations/2026-07-permission-actor/publicread-codemod.ts rewrite   shared/config/permissions-config.ts
 * Afterwards: `pnpm ts` (the removed modes are a type error until rewritten) and review each report line.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const mode = process.argv[2];
const target = process.argv[3];

if (mode !== 'inventory' && mode !== 'rewrite') {
  console.error('Usage: publicread-codemod.ts <inventory|rewrite> <file-or-dir>');
  process.exit(1);
}
if (!target || !fs.existsSync(target)) {
  console.error(`Target not found: ${target}`);
  process.exit(1);
}

// `publicRead('publicParent')` / `publicRead("publicParentOrSelf")` — single or double quotes, loose spacing.
const CASCADE_CALL = /publicRead\(\s*(['"])(publicParent|publicParentOrSelf)\1\s*\)/g;
// Nearest enclosing `case '<subject>':` above a match, for human-readable context.
const CASE_LINE = /case\s+['"]([^'"]+)['"]\s*:/;

const collectFiles = (p: string): string[] => {
  if (fs.statSync(p).isFile()) return /\.tsx?$/.test(p) ? [p] : [];
  return fs.readdirSync(p, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules' || e.name === 'dist') return [];
    return collectFiles(path.join(p, e.name));
  });
};

interface Hit {
  file: string;
  line: number;
  mode: string;
  subject: string;
}

const hits: Hit[] = [];

for (const file of collectFiles(target)) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');

  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(CASCADE_CALL)) {
      // Walk backwards to the nearest `case '<subject>':` for context.
      let subject = '(unknown)';
      for (let j = i; j >= 0; j--) {
        const c = CASE_LINE.exec(lines[j]);
        if (c) {
          subject = c[1];
          break;
        }
      }
      hits.push({ file, line: i + 1, mode: m[2], subject });
    }
  }

  if (mode === 'rewrite' && CASCADE_CALL.test(src)) {
    fs.writeFileSync(file, src.replace(CASCADE_CALL, "publicRead($1publicSelf$1)"));
  }
}

if (hits.length === 0) {
  console.log('No publicParent / publicParentOrSelf grants found — nothing to migrate.');
  process.exit(0);
}

console.log(`\n${mode === 'rewrite' ? 'REWROTE' : 'FOUND'} ${hits.length} parent-cascade public-read grant(s):\n`);
for (const h of hits) {
  console.log(`  ${path.relative(process.cwd(), h.file)}:${h.line}  subject '${h.subject}'  was publicRead('${h.mode}')`);
}
console.log(
  `\n⚠  Each entity above is now public ONLY when its own \`publicAt\` is set. Before shipping, for each:\n` +
    `   • add a \`publicAt\` column if missing (channel/product base columns now provide one),\n` +
    `   • populate it when the parent is published + backfill existing rows (see publicat-cascade.template.sql),\n` +
    `   • or confirm the entity is no longer meant to be publicly readable via its parent.\n` +
    `   Anonymous read handlers that resolved a parent row (\`parentRow\`) must drop it and read the row's own \`publicAt\`.\n`,
);
