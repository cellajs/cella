/** Checks authored Markdown and MDX for vocabulary that obscures the concrete rule being described. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = join(here, '..', '..');
const docExtensions = new Set(['.md', '.mdx']);
const disallowedTerm = /\binvariants?\b/gi;
const alternatives = 'rule, constraint, guarantee, requirement, contract, precondition, or assumption';

interface DocStyleViolation {
  file: string;
  line: number;
  column: number;
  term: string;
}

/** Find concrete-language violations in one document. */
export function findDocStyleViolations(file: string, source: string): DocStyleViolation[] {
  const violations: DocStyleViolation[] = [];

  for (const match of source.matchAll(disallowedTerm)) {
    const offset = match.index;
    const before = source.slice(0, offset);
    const lastLineBreak = before.lastIndexOf('\n');
    violations.push({
      file,
      line: before.split('\n').length,
      column: offset - lastLineBreak,
      term: match[0],
    });
  }

  return violations;
}

/** Format one actionable CLI diagnostic. */
export function formatDocStyleViolation(violation: DocStyleViolation): string {
  const location = `${violation.file}:${violation.line}:${violation.column}`;
  return `${location} replace "${violation.term}" with a precise ${alternatives}`;
}

function trackedDocs(repoRoot: string): string[] {
  return execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((file) => docExtensions.has(extname(file).toLowerCase()))
    .filter((file) => existsSync(join(repoRoot, file)))
    .sort();
}

/** Check every tracked or untracked, nonignored Markdown and MDX file in a repository. */
export function runDocStyleCheck(repoRoot = defaultRepoRoot): number {
  const violations = trackedDocs(repoRoot).flatMap((file) =>
    findDocStyleViolations(file, readFileSync(join(repoRoot, file), 'utf8')),
  );

  if (violations.length === 0) {
    console.log('[docs:style] OK, documentation uses concrete language.');
    return 0;
  }

  console.error(`[docs:style] ${violations.length} concrete-language violation(s):`);
  for (const violation of violations) {
    console.error(`  ${formatDocStyleViolation(violation)}`);
  }
  return 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (fileURLToPath(import.meta.url) === invokedPath) process.exitCode = runDocStyleCheck();
