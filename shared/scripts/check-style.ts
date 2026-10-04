/**
 * The style check (`pnpm style`, also in `pnpm lint`, `pnpm check` and CI): terminology, prose, comment placement, frontend
 * conventions, Tailwind class names, token contrast and migration notes in one pass. Exits non-zero on any finding.
 * `--audit` also prints review markers, which never fail; path arguments limit the files checked.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findAppVocabularyFindings, findProductNameFindings, loadAllowlist } from './check-app-vocabulary.ts';
import { commentFindings } from './check-comment-style.ts';
import { docFindings } from './check-doc-style.ts';
import { frontendFindings, frontendStores } from './check-frontend-style.ts';
import { migrationNoteFindings, owedNoteFindings } from './check-migration-notes.ts';
import { tailwindContext, tailwindFindings } from './check-tailwind-classes.ts';
import { tokenContrastFindings } from './check-token-contrast.ts';
import { type Finding, formatFinding, isRequested, repoFiles, repoRoot } from './repo-files.ts';

const audit = process.argv.includes('--audit');
const roots = process.argv.slice(2).filter((arg) => arg !== '--audit');
const allowlist = await loadAllowlist();
const files = repoFiles();
const stores = frontendStores(files);
const tailwind = await tailwindContext(files, allowlist.markerClasses);

/** What this branch changes against `origin/main`, uncommitted work included; nothing on main itself or without that ref. */
function branchChanges(): { files: string[]; messages: string } {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    const base = git('merge-base', 'HEAD', 'origin/main').trim();
    const changed = `${git('diff', '--name-only', base)}${git('ls-files', '-o', '--exclude-standard')}`;
    return { files: changed.split('\n').filter(Boolean), messages: git('log', '--format=%B', `${base}..HEAD`) };
  } catch {
    return { files: [], messages: '' };
  }
}

const requested = files.filter((file) => isRequested(file, roots));
const findings: Finding[] = migrationNoteFindings(requested, (file) => readFileSync(join(repoRoot, file), 'utf8'));
// Notes are written where they live: an app has no cella/migrations folder, and its own changes to its own paths owe none.
if (roots.length === 0 && files.includes('cella/migrations/_TEMPLATE.md')) {
  const { files: changed, messages } = branchChanges();
  findings.push(...owedNoteFindings(changed, messages, readFileSync(join(repoRoot, 'cella/cella.config.ts'), 'utf8')));
}
for (const file of requested) {
  const content = readFileSync(join(repoRoot, file));
  if (content.includes(0)) continue;
  const source = content.toString('utf8');
  const prose = allowlist.proseExclude?.some((prefix) => file.startsWith(prefix))
    ? []
    : [...docFindings(file, source), ...commentFindings(file, source, audit)];
  const inFile = [
    ...findAppVocabularyFindings(file, source, allowlist),
    ...findProductNameFindings(file, source),
    ...prose,
    ...frontendFindings(file, source, stores),
    ...tailwindFindings(file, source, tailwind),
    ...tokenContrastFindings(file, source),
  ];
  findings.push(...inFile.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0)));
}

function print(header: string, list: Finding[]): void {
  console.error([header, ...list.map((finding) => `  ${formatFinding(finding)}`)].join('\n'));
}

const required = findings.filter((finding) => !finding.review);
if (required.length > 0) print(`[style] ${required.length} finding(s):`, required);
else console.log('[style] OK, terminology, documentation, comments and frontend code follow the required style.');
if (audit) {
  const review = findings.filter((finding) => finding.review);
  print(`[style:audit] ${review.length} review marker(s):`, review);
}
process.exitCode = required.length > 0 ? 1 : 0;
