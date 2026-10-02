/**
 * The style check (`pnpm style`, also in `pnpm lint`, `pnpm check` and CI): terminology, prose rules for comments and
 * docs, comment placement, frontend conventions, Tailwind class names and migration note shape in one pass. Exits non-zero on any finding.
 * `--audit` also prints review markers, which never fail; path arguments limit the files checked.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findAppVocabularyFindings, findProductNameFindings, loadAllowlist } from './check-app-vocabulary.ts';
import { commentFindings } from './check-comment-style.ts';
import { docFindings } from './check-doc-style.ts';
import { frontendFindings, frontendStores } from './check-frontend-style.ts';
import { migrationNoteFindings } from './check-migration-notes.ts';
import { tailwindContext, tailwindFindings } from './check-tailwind-classes.ts';
import { type Finding, formatFinding, isRequested, repoFiles, repoRoot } from './repo-files.ts';

const audit = process.argv.includes('--audit');
const roots = process.argv.slice(2).filter((arg) => arg !== '--audit');
const allowlist = await loadAllowlist();
const files = repoFiles();
const stores = frontendStores(files);
const tailwind = await tailwindContext(files, allowlist.markerClasses);

const requested = files.filter((file) => isRequested(file, roots));
const findings: Finding[] = migrationNoteFindings(requested, (file) => readFileSync(join(repoRoot, file), 'utf8'));
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
