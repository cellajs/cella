/** Checks authored Markdown and MDX for vocabulary that obscures the concrete rule being described. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  requiredAgentVocabularyRules,
  reviewAgentVocabularyRules,
} from './agent-vocabulary.ts';

const here = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = join(here, '..', '..');
const docExtensions = new Set(['.md', '.mdx']);
const disallowedTerm = /\binvariants?\b/gi;
const alternatives = 'rule, constraint, guarantee, requirement, contract, precondition, or assumption';
const agentVocabularyExcludedPrefixes = ['cella/migrations/', 'infra/', 'sdk/gen/'];
const agentVocabularyExcludedFiles = new Set(['cella/CHANGELOG.md']);

interface DocStyleViolation {
  file: string;
  line: number;
  column: number;
  term: string;
}

export interface AgentVocabularyFinding {
  file: string;
  line: number;
  column: number;
  term: string;
  rule: string;
  message: string;
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

function maskMarkdownCode(source: string): string {
  let inFence = false;
  return source
    .split('\n')
    .map((line) => {
      if (/^\s*(?:```|~~~)/.test(line)) {
        inFence = !inFence;
        return ' '.repeat(line.length);
      }
      if (inFence) return ' '.repeat(line.length);
      return line
        .replace(/\]\([^)]+\)/g, (match) => `]${' '.repeat(match.length - 1)}`)
        .replace(/`[^`\n]*`/g, (match) => ' '.repeat(match.length));
    })
    .join('\n');
}

/** Find agent-associated vocabulary in authored prose while ignoring code examples and link targets. */
export function findAgentVocabularyFindings(
  file: string,
  source: string,
  level: 'required' | 'review' = 'required',
): AgentVocabularyFinding[] {
  const findings: AgentVocabularyFinding[] = [];
  const prose = maskMarkdownCode(source);
  const rules = level === 'required' ? requiredAgentVocabularyRules : reviewAgentVocabularyRules;

  for (const rule of rules) {
    const pattern = new RegExp(rule.pattern.source, `${rule.pattern.flags}g`);
    for (const match of prose.matchAll(pattern)) {
      const offset = match.index;
      const before = prose.slice(0, offset);
      const lastLineBreak = before.lastIndexOf('\n');
      findings.push({
        file,
        line: before.split('\n').length,
        column: offset - lastLineBreak,
        term: match[0],
        rule: rule.name,
        message: rule.message,
      });
    }
  }

  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}

/** Format one actionable CLI diagnostic. */
export function formatDocStyleViolation(violation: DocStyleViolation): string {
  const location = `${violation.file}:${violation.line}:${violation.column}`;
  return `${location} replace "${violation.term}" with a precise ${alternatives}`;
}

/** Format one agent-vocabulary diagnostic. */
export function formatAgentVocabularyFinding(finding: AgentVocabularyFinding): string {
  const location = `${finding.file}:${finding.line}:${finding.column}`;
  return `${location} [${finding.rule}] "${finding.term}": ${finding.message}`;
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

function checksAgentVocabulary(file: string): boolean {
  return (
    !agentVocabularyExcludedFiles.has(file) &&
    !agentVocabularyExcludedPrefixes.some((prefix) => file.startsWith(prefix))
  );
}

/** Check every tracked or untracked, nonignored Markdown and MDX file in a repository. */
export function runDocStyleCheck(repoRoot = defaultRepoRoot, audit = false): number {
  const docs = trackedDocs(repoRoot);
  const violations = docs.flatMap((file) =>
    findDocStyleViolations(file, readFileSync(join(repoRoot, file), 'utf8')),
  );
  const vocabularyDocs = docs.filter(checksAgentVocabulary);
  const requiredVocabulary = vocabularyDocs.flatMap((file) =>
    findAgentVocabularyFindings(file, readFileSync(join(repoRoot, file), 'utf8')),
  );
  const reviewVocabulary = audit
    ? vocabularyDocs.flatMap((file) =>
        findAgentVocabularyFindings(file, readFileSync(join(repoRoot, file), 'utf8'), 'review'),
      )
    : [];

  if (violations.length === 0 && requiredVocabulary.length === 0) {
    console.log('[docs:style] OK, documentation uses concrete language.');
  } else {
    if (violations.length > 0) {
      console.error(`[docs:style] ${violations.length} concrete-language violation(s):`);
      for (const violation of violations) {
        console.error(`  ${formatDocStyleViolation(violation)}`);
      }
    }
    if (requiredVocabulary.length > 0) {
      console.error(
        `[docs:style] ${requiredVocabulary.length} required vocabulary replacement(s):`,
      );
      for (const finding of requiredVocabulary) {
        console.error(`  ${formatAgentVocabularyFinding(finding)}`);
      }
    }
  }

  if (audit) {
    console.warn(`[docs:style:audit] ${reviewVocabulary.length} review marker(s):`);
    for (const finding of reviewVocabulary) {
      console.warn(`  ${formatAgentVocabularyFinding(finding)}`);
    }
  }

  return violations.length === 0 && requiredVocabulary.length === 0 ? 0 : 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (fileURLToPath(import.meta.url) === invokedPath) {
  process.exitCode = runDocStyleCheck(defaultRepoRoot, process.argv.includes('--audit'));
}
