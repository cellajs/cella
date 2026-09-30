/** Comments of a source file: the TypeScript AST for scripts, a string-aware scanner for JSONC, patterns for the rest. */
import { extname } from 'node:path';
import ts from 'typescript';

export interface Comment {
  offset: number;
  end: number;
  text: string;
}

export const scriptExtensions = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);

const kept = new Map<string, ts.SourceFile>();
let keptPrefix: string | undefined;
let lastParsed: ts.SourceFile | undefined;

/** Keeps the parses of files under `prefix` for the process, for checks that read the same files one after another. */
export function keepParses(prefix: string): void {
  keptPrefix = prefix;
}

/** The TypeScript parse of a script file; the latest parse and the kept ones are reused. */
export function parseSource(file: string, source: string): ts.SourceFile {
  const cached = lastParsed?.fileName === file ? lastParsed : kept.get(file);
  if (cached?.text === source) return cached;
  const kind = ['.tsx', '.jsx'].includes(extname(file)) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  lastParsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  if (keptPrefix !== undefined && file.startsWith(keptPrefix)) kept.set(file, lastParsed);
  return lastParsed;
}

function scriptComments(file: string, source: string): Comment[] {
  const comments = new Map<number, Comment>();
  const add = (ranges: readonly ts.CommentRange[] | undefined) => {
    for (const { pos, end } of ranges ?? []) comments.set(pos, { offset: pos, end, text: source.slice(pos, end) });
  };
  const visit = (node: ts.Node) => {
    add(ts.getLeadingCommentRanges(source, node.pos));
    add(ts.getTrailingCommentRanges(source, node.end));
    node.forEachChild(visit);
  };
  visit(parseSource(file, source));
  return [...comments.values()].sort((a, b) => a.offset - b.offset);
}

function jsoncComments(source: string): Comment[] {
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
    comments.push({ offset: start, end: i + 1, text: source.slice(start, i + 1) });
  }
  return comments;
}

/** Block comments first, then line comments, for SQL; `#` comments that start a line for YAML, Dockerfile and Caddyfile. */
export function sourceComments(file: string, source: string): Comment[] {
  const extension = extname(file);
  if (scriptExtensions.has(extension)) return scriptComments(file, source);
  if (extension === '.jsonc') return jsoncComments(source);
  const patterns =
    extension === '.css' || extension === '.scss'
      ? [/\/\*[\s\S]*?\*\//g]
      : extension === '.sql'
        ? [/\/\*[\s\S]*?\*\//g, /--[^\n]*/g]
        : [/^[\t ]*#[^\n]*/gm];
  return patterns.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => ({
      offset: match.index,
      end: match.index + match[0].length,
      text: match[0],
    })),
  );
}
