/** Comments of a source file: the TypeScript AST for scripts, a string-aware scanner for JSONC, patterns for the rest. */
import { extname } from 'node:path';
import ts from 'typescript';

export interface Comment {
  offset: number;
  end: number;
  text: string;
  reviewOnly?: boolean;
}

export const scriptExtensions = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);

let lastParsed: ts.SourceFile | undefined;

/** The TypeScript parse of a script file; the checks of one file share it. */
export function parseSource(file: string, source: string): ts.SourceFile {
  if (lastParsed?.fileName === file && lastParsed.text === source) return lastParsed;
  const kind = ['.tsx', '.jsx'].includes(extname(file)) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  lastParsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  return lastParsed;
}

/**
 * Comments at node boundaries and, with `tokenBoundaries`, the ones only a token boundary reaches: after an opening
 * bracket, in an empty JSX expression, before a `.` that starts a line. Every comment trails a token on its line or
 * leads the token after a line break. The token-only ones are marked `reviewOnly` so apps can fix theirs before they
 * fail the build; walking the tokens costs about as much as the parse, so only the audit asks for them.
 */
function scriptComments(file: string, source: string, tokenBoundaries: boolean): Comment[] {
  const sourceFile = parseSource(file, source);
  const comments = new Map<number, Comment>();
  const add = (ranges: readonly ts.CommentRange[] | undefined, reviewOnly: boolean) => {
    for (const { pos, end } of ranges ?? []) {
      if (!comments.has(pos)) comments.set(pos, { offset: pos, end, text: source.slice(pos, end), reviewOnly });
    }
  };
  const visitNodes = (node: ts.Node) => {
    add(ts.getLeadingCommentRanges(source, node.pos), false);
    add(ts.getTrailingCommentRanges(source, node.end), false);
    node.forEachChild(visitNodes);
  };
  const visitTokens = (node: ts.Node) => {
    if (ts.isJSDoc(node)) return;
    const children = node.getChildren(sourceFile);
    if (children.length === 0) {
      add(ts.getLeadingCommentRanges(source, node.pos), true);
      add(ts.getTrailingCommentRanges(source, node.end), true);
    }
    for (const child of children) visitTokens(child);
  };
  visitNodes(sourceFile);
  if (tokenBoundaries) visitTokens(sourceFile);
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

/** Index of the `#` that opens a comment on a YAML line, or -1; `#` inside a quoted scalar or a word is text. */
function commentHash(line: string): number {
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quote) {
      if (char === '\\' && quote === '"') i++;
      else if (char === quote && quote === "'" && line[i + 1] === "'") i++;
      else if (char === quote) quote = '';
    } else if ((char === '"' || char === "'") && /^$|[\s[{,]$/.test(line.slice(0, i))) {
      quote = char;
    } else if (char === '#' && (i === 0 || line[i - 1] === ' ' || line[i - 1] === '\t')) {
      return i;
    }
  }
  return -1;
}

/** Comments after a YAML value, outside block scalars, whose lines hold text in another language. */
function yamlTrailingComments(source: string): Comment[] {
  const comments: Comment[] = [];
  let offset = 0;
  let blockIndent = -1;
  for (const line of source.split('\n')) {
    const indent = line.length - line.trimStart().length;
    if (blockIndent < 0 || (line.trim() && indent <= blockIndent)) {
      const hash = commentHash(line);
      const value = hash < 0 ? line : line.slice(0, hash);
      if (hash >= 0 && value.trim()) {
        comments.push({ offset: offset + hash, end: offset + line.length, text: line.slice(hash) });
      }
      blockIndent = value.trim() && /(?:^|\s)[|>][0-9+-]*\s*$/.test(value) ? indent : -1;
    }
    offset += line.length + 1;
  }
  return comments;
}

/**
 * Block comments first, then line comments, for SQL. `#` comments that start a line for YAML, Dockerfile and
 * Caddyfile, with the comments after a YAML value in document order.
 */
export function sourceComments(file: string, source: string, tokenBoundaries = false): Comment[] {
  const extension = extname(file);
  if (scriptExtensions.has(extension)) return scriptComments(file, source, tokenBoundaries);
  if (extension === '.jsonc') return jsoncComments(source);
  const patterns =
    extension === '.css' || extension === '.scss'
      ? [/\/\*[\s\S]*?\*\//g]
      : extension === '.sql'
        ? [/\/\*[\s\S]*?\*\//g, /--[^\n]*/g]
        : [/^[\t ]*#[^\n]*/gm];
  const comments = patterns.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => ({ offset: match.index, end: match.index + match[0].length, text: match[0] })),
  );
  if (extension !== '.yaml' && extension !== '.yml') return comments;
  return [...comments, ...yamlTrailingComments(source)].sort((a, b) => a.offset - b.offset);
}
