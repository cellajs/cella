import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { alignmentFindings, type BranchChanges, owedAlignmentFindings } from './alignment-rules.ts';
import { buttonRecipeFindings } from './button-recipe-rules.ts';
import { loadAllowlist, productNameFindings, vocabularyFindings } from './check-app-vocabulary.ts';
import { commentFindings } from './comment-rules.ts';
import { docFindings } from './doc-rules.ts';
import { frontendFindings, frontendStores } from './frontend-rules.ts';
import { type Finding, formatFinding, isRequested, repoFiles, repoRoot } from './repo-files.ts';
import { stampFindings } from './stamp-rules.ts';
import { tailwindContext, tailwindFindings } from './tailwind-class-rules.ts';
import { textColorFindings } from './text-color-rules.ts';
import { tokenContrastFindings } from './token-contrast-rules.ts';

const audit = process.argv.includes('--audit');
const roots = process.argv.slice(2).filter((arg) => arg !== '--audit');
const allowlist = await loadAllowlist();
const files = repoFiles();
const stores = frontendStores(files);
const tailwind = await tailwindContext(files, allowlist.markerClasses);

/** The branch's changes since its merge base with `origin/main`, uncommitted and untracked files included; empty without that ref. */
function branchChanges(): BranchChanges {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    const base = git('merge-base', 'HEAD', 'origin/main').trim();
    const untracked = git('ls-files', '-o', '--exclude-standard');
    const paths = (diff: string) => `${diff}${untracked}`.split('\n').filter(Boolean);
    return {
      changed: paths(git('diff', '--name-only', base)),
      added: paths(git('diff', '--name-only', '--no-renames', '--diff-filter=A', base)),
      messages: git('log', '--format=%B', `${base}..HEAD`),
    };
  } catch {
    return { changed: [], added: [], messages: '' };
  }
}

const requested = files.filter((file) => isRequested(file, roots));
const findings: Finding[] = roots
  .filter((root) => !files.some((file) => isRequested(file, [root])))
  .map((root) => ({ file: root, rule: 'path-argument', message: 'no file matches this path' }));
findings.push(...alignmentFindings(requested, (file) => readFileSync(join(repoRoot, file), 'utf8')));
// Alignments are written where they live: an app's own changes to its own paths owe none. Every upgraded app has an upgrade
// manifest, and an upgrade by a CLI before 0.5 also copied the alignments folder in, so the folder alone does not mark the template.
if (roots.length === 0 && files.includes('cella/alignments/_TEMPLATE.md') && !files.includes('cella/cella.manifest.json')) {
  findings.push(...owedAlignmentFindings(branchChanges(), readFileSync(join(repoRoot, 'cella/cella.config.ts'), 'utf8')));
}
for (const file of requested) {
  const content = readFileSync(join(repoRoot, file));
  if (content.includes(0)) continue;
  const source = content.toString('utf8');
  const prose = allowlist.proseExclude?.some((prefix) => file.startsWith(prefix))
    ? []
    : [...docFindings(file, source), ...commentFindings(file, source)];
  const inFile = [
    ...vocabularyFindings(file, source, allowlist),
    ...productNameFindings(file, source),
    ...prose,
    ...frontendFindings(file, source, stores),
    ...stampFindings(file, source),
    ...tailwindFindings(file, source, tailwind),
    ...textColorFindings(file, source),
    ...buttonRecipeFindings(file, source),
    ...tokenContrastFindings(file, source),
  ];
  findings.push(...inFile.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0)));
}

function print(header: string, list: Finding[]): void {
  console.error([header, ...list.map((finding) => `  ${formatFinding(finding)}`)].join('\n'));
}

const required = findings.filter((finding) => !finding.review);
if (required.length > 0) print(`[style] ${required.length} finding(s):`, required);
else console.info('[style] OK, terminology, documentation, comments and frontend code follow the required style.');
if (audit) {
  const review = findings.filter((finding) => finding.review);
  print(`[style:audit] ${review.length} review marker(s):`, review);
}
process.exitCode = required.length > 0 ? 1 : 0;
