import { basename, extname } from 'node:path';
import ts from 'typescript';
import { isProseExempt, proseRules, ruleFindings } from './prose-rules.ts';
import { type Finding, lineColumn } from './repo-files.ts';
import { type Comment, parseSource, scriptExtensions, sourceComments } from './source-comments.ts';

const sourceExtensions = new Set([...scriptExtensions, '.css', '.json', '.jsonc', '.scss', '.sql', '.yaml', '.yml']);
const textRules = proseRules.filter((rule) => rule.text);
const commentRules = proseRules.filter((rule) => !rule.text);
const placementAdvice = 'move shared context to a README or attach a concise local constraint to a declaration';

function isSource(file: string): boolean {
  if (isProseExempt(file, 'source')) return false;
  const name = basename(file);
  return sourceExtensions.has(extname(name)) || name.startsWith('Dockerfile') || name === 'Caddyfile' || name.startsWith('.env');
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

/** Statements a comment of more than three prose lines may sit directly above. */
const declarationKinds = new Set([
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.EnumDeclaration,
  ts.SyntaxKind.ExportAssignment,
  ts.SyntaxKind.ExportDeclaration,
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

/** Rule findings in one source file, `text` rules over its whole text and the rest over its comments, and placement findings. */
export function commentFindings(file: string, source: string): Finding[] {
  if (!isSource(file)) return [];
  const comments = sourceComments(file, source);
  const findings: Finding[] = [
    ...textRules.flatMap((rule) => ruleFindings(rule, file, source, (index) => lineColumn(source, index))),
    ...comments.flatMap((comment) =>
      commentRules.flatMap((rule) => ruleFindings(rule, file, comment.text, (index) => lineColumn(source, comment.offset + index))),
    ),
  ];

  for (const comment of groupedComments(comments, source)) {
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
