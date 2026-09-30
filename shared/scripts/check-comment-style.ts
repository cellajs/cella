/**
 * Checks source comments for prose that belongs in commit history or review discussion.
 * Audit modes report lower-confidence wording and detached long-form comment blocks.
 */
import { readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import ts from 'typescript';
import { proseRules } from './prose-rules.ts';
import { isRequested, lineColumn, repoFiles, repoRoot, writeFindings } from './repo-files.ts';
import { type Comment, parseSource, scriptExtensions, sourceComments } from './source-comments.ts';

const modeFlags = ['--audit', '--placement', '--concrete-language'];
const audit = process.argv.includes('--audit');
const placement = process.argv.includes('--placement');
const concreteLanguageOnly = process.argv.includes('--concrete-language');
const requestedRoots = process.argv.slice(2).filter((arg) => !modeFlags.includes(arg));

const sourceExtensions = new Set([...scriptExtensions, '.css', '.jsonc', '.scss', '.sql', '.yaml', '.yml']);
const excludedPrefixes = ['backend/drizzle/', 'cella/migrations/', 'locales/', 'sdk/gen/'];
/** The required rules `--concrete-language` keeps. */
const languageRules = new Set(['concrete-language', 'load-bearing']);
const activeRules = proseRules.filter(
  (rule) =>
    rule.message.comments && (rule.level === 'review' ? audit : !concreteLanguageOnly || languageRules.has(rule.name)),
);

function isSource(file: string): boolean {
  if (!isRequested(file, requestedRoots)) return false;
  if (excludedPrefixes.some((prefix) => file.startsWith(prefix))) return false;
  if (file === 'infra/compose.gen.yml' || file.includes('.gen.')) return false;
  const name = basename(file);
  return sourceExtensions.has(extname(name)) || name.startsWith('Dockerfile') || name === 'Caddyfile';
}

function groupedComments(comments: Comment[], source: string): Comment[] {
  const groups: Comment[] = [];
  for (const comment of comments) {
    const previous = groups.at(-1);
    if (
      comment.text.startsWith('//') &&
      previous?.text.startsWith('//') &&
      /^[\t ]*\r?\n[\t ]*$/.test(source.slice(previous.end, comment.offset))
    ) {
      previous.end = comment.end;
      previous.text += `\n${comment.text}`;
      continue;
    }
    groups.push({ ...comment });
  }
  return groups;
}

function proseLineCount(text: string): number {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*\/\/\/?\s?/, '')
        .replace(/^\s*\/\*\*?\s?/, '')
        .replace(/^\s*\*\/?\s?/, '')
        .replace(/\s*\*\/$/, '')
        .trim(),
    )
    .filter(Boolean).length;
}

function isRequiredHeader(text: string): boolean {
  return /\b(?:copyright|licensed under|permission is hereby granted|the software is provided)\b/i.test(text);
}

const declarationKinds = new Set([
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.EnumDeclaration,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.ModuleDeclaration,
  ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.VariableStatement,
]);

function hasDirectDeclarationOwner(file: string, source: string, comment: Comment): boolean {
  if (!scriptExtensions.has(extname(file))) return false;

  const sourceFile = parseSource(file, source);
  const containingStatement = sourceFile.statements.find(
    (statement) => statement.getStart(sourceFile) < comment.offset && comment.end < statement.end,
  );
  if (containingStatement) return true;

  const nextStatement = sourceFile.statements.find((statement) => statement.getStart(sourceFile) >= comment.end);
  if (!nextStatement || !declarationKinds.has(nextStatement.kind)) return false;

  const gap = source.slice(comment.end, nextStatement.getStart(sourceFile));
  return /^\s*$/.test(gap) && !/\r?\n[\t ]*\r?\n/.test(gap);
}

const failures: string[] = [];
const findings: string[] = [];
const placementFailures: string[] = [];

for (const file of repoFiles().filter(isSource)) {
  const source = readFileSync(join(repoRoot, file), 'utf8');
  const comments = sourceComments(file, source);
  for (const comment of comments) {
    for (const rule of activeRules) {
      if (rule.exclude?.comments?.test(file) || !rule.pattern.test(comment.text)) continue;
      const { line, column } = lineColumn(source, comment.offset);
      const list = rule.level === 'review' ? findings : failures;
      list.push(`${file}:${line}:${column} [${rule.name}] ${rule.message.comments}`);
    }
  }
  if (!placement) continue;
  for (const comment of groupedComments(comments, source)) {
    const lineCount = proseLineCount(comment.text);
    if (lineCount <= 3 || isRequiredHeader(comment.text) || hasDirectDeclarationOwner(file, source, comment)) continue;
    const { line, column } = lineColumn(source, comment.offset);
    placementFailures.push(
      `${file}:${line}:${column} [detached-long-comment] ${lineCount} prose lines; move shared context to a README or attach a concise local constraint to a declaration`,
    );
  }
}

writeFindings(
  console.error,
  concreteLanguageOnly ? '[comments:language]' : '[comments:check]',
  'violation(s)',
  failures,
);
writeFindings(console.warn, '[comments:audit]', 'review marker(s)', findings);
writeFindings(console.error, '[comments:placement]', 'detached long comment(s)', placementFailures);

if (failures.length > 0 || placementFailures.length > 0) process.exit(1);
const successMessage = placement
  ? '[comments:placement] OK, long comments are local to declarations or executable code.'
  : concreteLanguageOnly
    ? '[comments:language] OK, source comments use concrete language.'
    : audit
      ? `[comments:audit] OK, ${findings.length} lower-confidence marker(s) require review.`
      : '[comments:check] OK, source comments follow the required style.';
console.log(successMessage);
