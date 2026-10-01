/**
 * Prose rules over source comments, and comment placement: a comment of more than three prose lines sits inside a
 * statement or directly above a declaration, so shared context goes to a README.
 */
import { basename, extname } from 'node:path';
import ts from 'typescript';
import { proseRules, ruleFindings } from './prose-rules.ts';
import { type Finding, lineColumn } from './repo-files.ts';
import { type Comment, parseSource, scriptExtensions, sourceComments } from './source-comments.ts';

const sourceExtensions = new Set([...scriptExtensions, '.css', '.jsonc', '.scss', '.sql', '.yaml', '.yml']);
const excludedPrefixes = ['backend/drizzle/', 'cella/migrations/', 'locales/', 'sdk/gen/'];
const placementAdvice = 'move shared context to a README or attach a concise local constraint to a declaration';

function isSource(file: string): boolean {
  if (excludedPrefixes.some((prefix) => file.startsWith(prefix)) || file.includes('.gen.')) return false;
  const name = basename(file);
  return sourceExtensions.has(extname(name)) || name.startsWith('Dockerfile') || name === 'Caddyfile';
}

function groupedComments(comments: Comment[], source: string): Comment[] {
  const groups: Comment[] = [];
  for (const comment of comments) {
    const previous = groups.at(-1);
    if (comment.text.startsWith('//') && previous?.text.startsWith('//') && /^[\t ]*\r?\n[\t ]*$/.test(source.slice(previous.end, comment.offset))) {
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

/** Rule and placement findings in one source file; `audit` adds the comments only a token boundary reaches. */
export function commentFindings(file: string, source: string, audit: boolean): Finding[] {
  if (!isSource(file)) return [];
  const comments = sourceComments(file, source, audit);
  const findings: Finding[] = comments.flatMap((comment) =>
    proseRules.flatMap((rule) =>
      ruleFindings(rule, file, comment.text, (index) => lineColumn(source, comment.offset + index)).map((finding) => ({
        ...finding,
        review: finding.review || !!comment.reviewOnly,
      })),
    ),
  );

  const established = comments.filter((comment) => !comment.reviewOnly);
  for (const comment of groupedComments(established, source)) {
    const lineCount = proseLineCount(comment.text);
    if (lineCount <= 3 || isRequiredHeader(comment.text) || hasDirectDeclarationOwner(file, source, comment)) continue;
    findings.push({
      file,
      ...lineColumn(source, comment.offset),
      rule: 'detached-long-comment',
      message: `${lineCount} prose lines; ${placementAdvice}`,
    });
  }
  return findings;
}
