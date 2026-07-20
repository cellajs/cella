/**
 * Checks source comments for prose that belongs in commit history or review discussion.
 * Audit modes report lower-confidence wording and detached long-form comment blocks.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const audit = process.argv.includes('--audit');
const placement = process.argv.includes('--placement');
const concreteLanguageOnly = process.argv.includes('--concrete-language');
const requestedRoots = process.argv
  .slice(2)
  .filter((arg) => arg !== '--audit' && arg !== '--placement' && arg !== '--concrete-language');

const sourceExtensions = new Set([
  '.cjs',
  '.css',
  '.js',
  '.jsonc',
  '.jsx',
  '.mjs',
  '.scss',
  '.sql',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);
const typedExtensions = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const excludedPrefixes = [
  'backend/drizzle/',
  'cella/migrations/',
  'locales/',
  'sdk/gen/',
];

interface Comment {
  file: string;
  offset: number;
  end: number;
  text: string;
}

interface Rule {
  name: string;
  pattern: RegExp;
  message: string;
}

const requiredRules: Rule[] = [
  {
    name: 'em-dash',
    pattern: /\u2014/,
    message: 'split the sentence or remove the secondary clause',
  },
  {
    name: 'contrast-history',
    pattern: /\b(?:instead|rather than|as opposed to)\b/i,
    message: 'state the current behavior or local constraint directly',
  },
  {
    name: 'concrete-language',
    pattern: /\binvariants?\b/i,
    message:
      'name the precise rule, constraint, guarantee, requirement, contract, precondition, or assumption',
  },
  {
    name: 'change-history',
    pattern: /\b(?:previously|formerly|used to|originally)\b/i,
    message: 'move evolution history to the commit or migration documentation',
  },
  {
    name: 'review-conversation',
    pattern: /\b(?:maybe|perhaps|we (?:should|could|might)|(?:was|were) considered)\b/i,
    message: 'resolve the question or track it outside the source comment',
  },
];

const auditRules: Rule[] = [
  {
    name: 'compatibility-language',
    pattern: /\b(?:legacy|no longer|old (?:behavior|approach|path|implementation|code))\b/i,
    message: 'confirm that this describes an active compatibility contract',
  },
  {
    name: 'temporary-reasoning',
    pattern: /\b(?:for now|workaround|hack|temporary|temporarily)\b/i,
    message: 'state the active constraint or link tracked follow-up work',
  },
  {
    name: 'materialization-jargon',
    pattern: /\bmateriali[sz](?:e|ed|es|ing|ation|ations)\b/i,
    message: 'use a concrete verb unless this names the formal Yjs operation',
  },
];

const activeRequiredRules = concreteLanguageOnly
  ? requiredRules.filter((rule) => rule.name === 'concrete-language')
  : requiredRules;

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    .filter((file) => existsSync(join(repoRoot, file)));
}

function isRequested(file: string): boolean {
  if (requestedRoots.length === 0) return true;
  return requestedRoots.some((root) => {
    const normalized = root.replace(/^\.\//, '').replace(/\/$/, '');
    return file === normalized || file.startsWith(`${normalized}/`);
  });
}

function isSource(file: string): boolean {
  if (!isRequested(file)) return false;
  if (excludedPrefixes.some((prefix) => file.startsWith(prefix))) return false;
  if (file === 'infra/compose.gen.yml' || file.includes('.gen.')) return false;
  const name = basename(file);
  return sourceExtensions.has(extname(name)) || name.startsWith('Dockerfile') || name === 'Caddyfile';
}

function typedComments(file: string, source: string): Comment[] {
  const kind = extname(file) === '.tsx' || extname(file) === '.jsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const comments = new Map<number, Comment>();

  const addRanges = (ranges: readonly ts.CommentRange[] | undefined) => {
    for (const range of ranges ?? []) {
      comments.set(range.pos, {
        file,
        offset: range.pos,
        end: range.end,
        text: source.slice(range.pos, range.end),
      });
    }
  };

  const visit = (node: ts.Node) => {
    addRanges(ts.getLeadingCommentRanges(source, node.pos));
    addRanges(ts.getTrailingCommentRanges(source, node.end));
    node.forEachChild(visit);
  };
  visit(sourceFile);

  return [...comments.values()].sort((a, b) => a.offset - b.offset);
}

function jsoncComments(file: string, source: string): Comment[] {
  const comments: Comment[] = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '"') {
      for (i++; i < source.length; i++) {
        if (source[i] === '\\') i++;
        else if (source[i] === '"') break;
      }
      continue;
    }
    if (source[i] !== '/' || (source[i + 1] !== '/' && source[i + 1] !== '*')) continue;

    const start = i;
    if (source[++i] === '/') {
      while (i + 1 < source.length && source[i + 1] !== '\n') i++;
    } else {
      while (i + 1 < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      if (i + 1 < source.length) i++;
    }
    comments.push({ file, offset: start, end: i + 1, text: source.slice(start, i + 1) });
  }
  return comments;
}

function regexComments(file: string, source: string): Comment[] {
  if (extname(file) === '.jsonc') return jsoncComments(file, source);
  const comments: Comment[] = [];
  const extension = extname(file);
  const patterns =
    extension === '.css' || extension === '.scss'
      ? [/\/\*[\s\S]*?\*\//g]
      : extension === '.sql'
        ? [/\/\*[\s\S]*?\*\//g, /--[^\n]*/g]
        : [/^[\t ]*#[^\n]*/gm];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      comments.push({ file, offset: match.index, end: match.index + match[0].length, text: match[0] });
    }
  }
  return comments;
}

function lineAndColumn(source: string, offset: number): { line: number; column: number } {
  const before = source.slice(0, offset);
  const lines = before.split('\n');
  return { line: lines.length, column: lines.at(-1)!.length + 1 };
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
  return /\b(?:copyright|licensed under|permission is hereby granted|the software is provided)\b/i.test(
    text,
  );
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
  const extension = extname(file);
  if (!typedExtensions.has(extension)) return false;

  const kind = extension === '.tsx' || extension === '.jsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const containingStatement = sourceFile.statements.find(
    (statement) => statement.getStart(sourceFile) < comment.offset && comment.end < statement.end,
  );
  if (containingStatement) return true;

  const nextStatement = sourceFile.statements.find(
    (statement) => statement.getStart(sourceFile) >= comment.end,
  );
  if (!nextStatement || !declarationKinds.has(nextStatement.kind)) return false;

  const gap = source.slice(comment.end, nextStatement.getStart(sourceFile));
  return /^\s*$/.test(gap) && !/\r?\n[\t ]*\r?\n/.test(gap);
}

const failures: string[] = [];
const findings: string[] = [];
const placementFailures: string[] = [];

for (const file of trackedFiles().filter(isSource)) {
  const source = readFileSync(join(repoRoot, file), 'utf8');
  const extension = extname(file);
  const comments = typedExtensions.has(extension) ? typedComments(file, source) : regexComments(file, source);
  for (const comment of comments) {
    const location = lineAndColumn(source, comment.offset);
    for (const rule of activeRequiredRules) {
      if (rule.pattern.test(comment.text)) {
        failures.push(`${file}:${location.line}:${location.column} [${rule.name}] ${rule.message}`);
      }
    }
    if (!audit) continue;
    for (const rule of auditRules) {
      if (rule.pattern.test(comment.text)) {
        findings.push(`${file}:${location.line}:${location.column} [${rule.name}] ${rule.message}`);
      }
    }
  }
  if (!placement) continue;
  for (const comment of groupedComments(comments, source)) {
    const lineCount = proseLineCount(comment.text);
    if (lineCount <= 3 || isRequiredHeader(comment.text)) continue;
    if (hasDirectDeclarationOwner(file, source, comment)) continue;
    const location = lineAndColumn(source, comment.offset);
    placementFailures.push(
      [
        `${file}:${location.line}:${location.column} [detached-long-comment] ${lineCount} prose lines;`,
        'move shared context to a README or attach a concise local constraint to a declaration',
      ].join(' '),
    );
  }
}

if (failures.length > 0) {
  const label = concreteLanguageOnly ? 'comments:language' : 'comments:check';
  console.error(`[${label}] ${failures.length} violation(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
}

if (audit && findings.length > 0) {
  console.warn(`[comments:audit] ${findings.length} review marker(s):`);
  for (const finding of findings) console.warn(`  ${finding}`);
}

if (placement && placementFailures.length > 0) {
  console.error(`[comments:placement] ${placementFailures.length} detached long comment(s):`);
  for (const failure of placementFailures) console.error(`  ${failure}`);
}

if (failures.length > 0 || placementFailures.length > 0) process.exit(1);
const successMessage = placement
  ? '[comments:placement] OK, long comments are local to declarations or executable code.'
  : concreteLanguageOnly
    ? '[comments:language] OK, source comments use concrete language.'
    : audit
      ? `[comments:audit] OK, ${findings.length} lower-confidence marker(s) require review.`
      : '[comments:check] OK, source comments follow the required style.';
console.log(successMessage);
