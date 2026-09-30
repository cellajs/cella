/** Checks authored Markdown and MDX for vocabulary that obscures the concrete rule being described. */
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { loadAllowlist } from './check-app-vocabulary.ts';
import { type ProseRule, proseRules } from './prose-rules.ts';
import {
  repoRoot as defaultRepoRoot,
  isMain,
  lineColumn,
  type Output,
  repoFiles,
  writeFindings,
} from './repo-files.ts';

const docExtensions = new Set(['.md', '.mdx']);
const docRules = proseRules.filter((rule) => rule.message.docs);
/** Report sections of their own; the concrete-language rule also reads code examples. */
const concreteLanguage = docRules.find((rule) => rule.name === 'concrete-language')!;
const emDash = docRules.find((rule) => rule.name === 'em-dash')!;

interface DocStyleViolation {
  file: string;
  line: number;
  column: number;
  term: string;
}

type EmDashViolation = Omit<DocStyleViolation, 'term'>;

export interface AgentVocabularyFinding extends DocStyleViolation {
  rule: string;
  message: string;
}

function matches(file: string, text: string, rule: ProseRule): DocStyleViolation[] {
  if (rule.exclude?.docs?.test(file)) return [];
  const pattern = new RegExp(rule.pattern.source, `${rule.pattern.flags}g`);
  return [...text.matchAll(pattern)].map((match) => ({ file, ...lineColumn(text, match.index), term: match[0] }));
}

/** The prose view: inline code, fenced code and link targets blanked to spaces, so positions hold. */
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

/** Find concrete-language violations in one document. */
export function findDocStyleViolations(file: string, source: string): DocStyleViolation[] {
  return matches(file, source, concreteLanguage);
}

/** Em dashes in prose; inline and fenced code are masked so a rule may quote the character. */
export function findEmDashViolations(file: string, source: string): EmDashViolation[] {
  return matches(file, maskMarkdownCode(source), emDash).map(({ line, column }) => ({ file, line, column }));
}

/** Find agent-associated vocabulary in authored prose while ignoring code examples and link targets. */
export function findAgentVocabularyFindings(
  file: string,
  source: string,
  level: 'required' | 'review' = 'required',
): AgentVocabularyFinding[] {
  const prose = maskMarkdownCode(source);
  return docRules
    .filter((rule) => rule.level === level && rule !== concreteLanguage && rule !== emDash)
    .flatMap((rule) =>
      matches(file, prose, rule).map((match) => ({ ...match, rule: rule.name, message: rule.message.docs! })),
    )
    .sort((a, b) => a.line - b.line || a.column - b.column);
}

/** Format one actionable CLI diagnostic. */
export function formatDocStyleViolation(violation: DocStyleViolation): string {
  const location = `${violation.file}:${violation.line}:${violation.column}`;
  return `${location} replace "${violation.term}" with a precise ${concreteLanguage.message.docs}`;
}

export function formatEmDashViolation(violation: EmDashViolation): string {
  return `${violation.file}:${violation.line}:${violation.column} em dash (U+2014): ${emDash.message.docs}`;
}

export function formatAgentVocabularyFinding(finding: AgentVocabularyFinding): string {
  const location = `${finding.file}:${finding.line}:${finding.column}`;
  return `${location} [${finding.rule}] "${finding.term}": ${finding.message}`;
}

/** Check every tracked or untracked, nonignored Markdown and MDX file in a repository. */
export async function runDocStyleCheck(
  repoRoot = defaultRepoRoot,
  audit = false,
  output: Output = console,
): Promise<number> {
  const skipped = (await loadAllowlist(repoRoot)).proseExclude ?? [];
  const docs = repoFiles(repoRoot)
    .filter(
      (file) => docExtensions.has(extname(file).toLowerCase()) && !skipped.some((prefix) => file.startsWith(prefix)),
    )
    .sort()
    .map((file) => ({ file, source: readFileSync(join(repoRoot, file), 'utf8') }));
  const report = <T>(find: (file: string, source: string) => T[], format: (item: T) => string) =>
    docs.flatMap(({ file, source }) => find(file, source).map(format));

  const violations = report(findDocStyleViolations, formatDocStyleViolation);
  const emDashes = report(findEmDashViolations, formatEmDashViolation);
  const vocabulary = report(findAgentVocabularyFindings, formatAgentVocabularyFinding);
  const failed = violations.length > 0 || emDashes.length > 0 || vocabulary.length > 0;
  if (!failed) output.log('[docs:style] OK, documentation uses concrete language.');
  writeFindings(output.error, '[docs:style]', 'concrete-language violation(s)', violations);
  writeFindings(output.error, '[docs:style]', 'em dash(es)', emDashes);
  writeFindings(output.error, '[docs:style]', 'required vocabulary replacement(s)', vocabulary);

  if (audit) {
    const review = report(
      (file, source) => findAgentVocabularyFindings(file, source, 'review'),
      formatAgentVocabularyFinding,
    );
    output.error(`[docs:style:audit] ${review.length} review marker(s):`);
    for (const finding of review) output.error(`  ${finding}`);
  }

  return failed ? 1 : 0;
}

if (isMain(import.meta.url)) {
  process.exitCode = await runDocStyleCheck(defaultRepoRoot, process.argv.includes('--audit'));
}
