/**
 * Checks source comments for prose that belongs in commit history or review discussion.
 * Audit modes report lower-confidence wording and detached long-form comment blocks.
 */
import { readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import ts from 'typescript';
import { loadAllowlist } from './check-app-vocabulary.ts';
import { proseRules } from './prose-rules.ts';
import { isMain, isRequested, lineColumn, type Output, repoFiles, repoRoot, writeFindings } from './repo-files.ts';
import { type Comment, parseSource, scriptExtensions, sourceComments } from './source-comments.ts';

const modeFlags = ['--audit', '--placement', '--concrete-language'];
const sourceExtensions = new Set([...scriptExtensions, '.css', '.jsonc', '.scss', '.sql', '.yaml', '.yml']);
const excludedPrefixes = ['backend/drizzle/', 'cella/migrations/', 'locales/', 'sdk/gen/'];
/** The required rules `--concrete-language` keeps. */
const languageRules = new Set(['concrete-language', 'load-bearing']);
const placementAdvice = 'move shared context to a README or attach a concise local constraint to a declaration';

function isSource(file: string, skipped: string[]): boolean {
  if (skipped.some((prefix) => file.startsWith(prefix))) return false;
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

/** Runs the check with CLI `args`: mode flags and root paths to limit it to. Returns the exit code. */
export async function runCommentCheck(args: string[], output: Output = console): Promise<number> {
  const audit = args.includes('--audit');
  const placement = args.includes('--placement');
  const concreteLanguageOnly = args.includes('--concrete-language');
  const roots = args.filter((arg) => !modeFlags.includes(arg));
  const rules = proseRules.filter(
    (rule) =>
      rule.message.comments &&
      (rule.level === 'review' ? audit : !concreteLanguageOnly || languageRules.has(rule.name)),
  );
  const failures: string[] = [];
  const findings: string[] = [];
  const placementFailures: string[] = [];
  const skipped = [...excludedPrefixes, ...((await loadAllowlist()).proseExclude ?? [])];

  for (const file of repoFiles().filter((file) => isRequested(file, roots) && isSource(file, skipped))) {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    const comments = sourceComments(file, source);
    for (const comment of comments) {
      for (const rule of rules) {
        if (rule.exclude?.comments?.test(file) || !rule.pattern.test(comment.text)) continue;
        const { line, column } = lineColumn(source, comment.offset);
        const list = rule.level === 'review' ? findings : failures;
        list.push(`${file}:${line}:${column} [${rule.name}] ${rule.message.comments}`);
      }
    }
    if (!placement) continue;
    for (const comment of groupedComments(comments, source)) {
      const lineCount = proseLineCount(comment.text);
      if (lineCount <= 3 || isRequiredHeader(comment.text)) continue;
      if (hasDirectDeclarationOwner(file, source, comment)) continue;
      const { line, column } = lineColumn(source, comment.offset);
      placementFailures.push(
        `${file}:${line}:${column} [detached-long-comment] ${lineCount} prose lines; ${placementAdvice}`,
      );
    }
  }

  const label = concreteLanguageOnly ? '[comments:language]' : '[comments:check]';
  writeFindings(output.error, label, 'violation(s)', failures);
  writeFindings(output.error, '[comments:audit]', 'review marker(s)', findings);
  writeFindings(output.error, '[comments:placement]', 'detached long comment(s)', placementFailures);
  if (failures.length > 0 || placementFailures.length > 0) return 1;

  output.log(
    placement
      ? '[comments:placement] OK, long comments are local to declarations or executable code.'
      : concreteLanguageOnly
        ? '[comments:language] OK, source comments use concrete language.'
        : audit
          ? `[comments:audit] OK, ${findings.length} lower-confidence marker(s) require review.`
          : '[comments:check] OK, source comments follow the required style.',
  );
  return 0;
}

if (isMain(import.meta.url)) process.exitCode = await runCommentCheck(process.argv.slice(2));
