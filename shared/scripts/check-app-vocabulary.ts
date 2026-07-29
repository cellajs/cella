/** Rejects source-control-oriented template terminology outside explicit compatibility files. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = join(here, '..', '..');
const disallowedTerm = /fork/gi;
const allowedFiles = new Set([
  'cella.config.ts',
  'shared/scripts/check-app-vocabulary.test.ts',
  'shared/scripts/check-app-vocabulary.ts',
]);
const allowedPrefixes = ['cella/migrations/20260729T0922-app-product-mocks/'];

export interface AppVocabularyFinding {
  file: string;
  line: number;
  column: number;
  term: string;
  location: 'content' | 'path';
}

function isAllowed(file: string): boolean {
  return allowedFiles.has(file) || allowedPrefixes.some((prefix) => file.startsWith(prefix));
}

/** Find disallowed terminology in one repository path and its text content. */
export function findAppVocabularyFindings(
  file: string,
  source: string,
): AppVocabularyFinding[] {
  if (isAllowed(file)) return [];

  const findings: AppVocabularyFinding[] = [];
  const pathPattern = new RegExp(disallowedTerm.source, disallowedTerm.flags);
  for (const match of file.matchAll(pathPattern)) {
    findings.push({
      file,
      line: 0,
      column: match.index + 1,
      term: match[0],
      location: 'path',
    });
  }

  const contentPattern = new RegExp(disallowedTerm.source, disallowedTerm.flags);
  for (const match of source.matchAll(contentPattern)) {
    const before = source.slice(0, match.index);
    const lastLineBreak = before.lastIndexOf('\n');
    findings.push({
      file,
      line: before.split('\n').length,
      column: match.index - lastLineBreak,
      term: match[0],
      location: 'content',
    });
  }
  return findings;
}

function trackedFiles(repoRoot: string): string[] {
  return execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    .filter((file) => existsSync(join(repoRoot, file)))
    .sort();
}

/** Check every tracked or untracked, nonignored text file in a repository. */
export function runAppVocabularyCheck(repoRoot = defaultRepoRoot): number {
  const findings = trackedFiles(repoRoot).flatMap((file) => {
    const source = readFileSync(join(repoRoot, file));
    if (source.includes(0)) return [];
    return findAppVocabularyFindings(file, source.toString('utf8'));
  });

  if (findings.length === 0) {
    console.info('[app-vocabulary] OK, template and app terminology is consistent.');
    return 0;
  }

  console.error(`[app-vocabulary] ${findings.length} disallowed occurrence(s):`);
  for (const finding of findings) {
    const location =
      finding.location === 'path'
        ? finding.file
        : `${finding.file}:${finding.line}:${finding.column}`;
    console.error(`  ${location} replace "${finding.term}" with template/app terminology`);
  }
  return 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (fileURLToPath(import.meta.url) === invokedPath) {
  process.exitCode = runAppVocabularyCheck();
}
