/**
 * Codemod: text takes one of four color steps, and a label that heads content uses the `group-label` utility.
 *
 * `rewrite` maps opacity modifiers on text tokens to a step, in every string of a .ts or .tsx file (class
 * attributes, cn(), tw() and cva alike):
 *   text-muted-foreground/50..79        -> text-faint-foreground
 *   text-sidebar-foreground/<n>         -> text-muted-foreground, or text-foreground from /85
 *   text-foreground/85..99              -> text-foreground
 *   text-foreground/60..84              -> text-foreground-soft
 *   (data-)placeholder:text-muted-foreground -> (data-)placeholder:text-faint-foreground
 * `inventory` lists those rewrites and what needs judgment, which no mode rewrites: any other text token with an
 * opacity modifier, opacity-50..80 at rest on an element that holds text, palette grays, uppercase or lowercase, and
 * a hand-rolled group label (muted text on a heading, dt, th or legend, or at a small size with font-medium).
 *
 * Usage (from the repo root):
 *   pnpm exec tsx cella/alignments/<id>/text-color-steps.ts inventory frontend/src
 *   pnpm exec tsx cella/alignments/<id>/text-color-steps.ts rewrite   frontend/src
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import ts from 'typescript';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.turbo', 'gen', 'stories']);

/** Template paths that keep palette grays or a case transform on purpose, with the reason. */
const ACCEPTED = {
  palette: {
    'modules/docs/': 'syntax, HTTP method and status colors',
    'modules/common/json-viewer/theme.ts': 'syntax colors',
  },
  case: {
    'modules/docs/operations/method-label.tsx': 'the HTTP method chip is uppercase',
    'modules/ui/kbd.tsx': 'a key name',
  },
} satisfies Record<string, Record<string, string>>;
const accepts = (paths: Record<string, string>, file: string) => Object.keys(paths).some((path) => file.includes(path));

const MODIFIER = /(?<![\w-])((?:[\w-]+:)*?)text-(muted|sidebar|)-?foreground\/(\d+)(?![\w/.-])/g;
const PLACEHOLDER = /(?<![\w-])((?:data-)?placeholder):text-muted-foreground(?![\w/-])/g;
const LEFT_MODIFIER = /(?<![\w-])(?:[\w-]+:)*text-[a-z-]*foreground(?:-soft)?\/[\w.[\]]+/;
const PALETTE = /(?<![\w-])(?:[\w-]+:)*text-(?:gray|slate|zinc|neutral|stone)-\d+(?:\/\d+)?/;
const CASE = /(?<![\w:-])(?:(?!first-letter:)[\w-]+:)*(?:uppercase|lowercase)(?![\w-])/;
const REST_VARIANT = /^(?:sm|md|lg|xl|2xl|max-[\w-]+|min-[\w-]+|dark|more-contrast|standalone)$/;
const TEXT_HINT = /^(?:text-(?:2xs|xs|sm|md|base|lg|\d?xl|\[[^\]]+\])|font-(?:light|normal|medium|semibold|bold))$/;
const PICTURE_TAG = /(?:Icon|Avatar|Spinner)$|^(?:svg|img)$/;
const LABEL_TAG = /^(?:h[1-6]|dt|th|legend)$/;

/** The step a modified text token maps to, or null when the case needs judgment. */
function step(token: string, amount: number): string | null {
  if (token === 'muted') return amount >= 50 && amount < 80 ? 'text-faint-foreground' : null;
  if (token === 'sidebar') return amount >= 85 ? 'text-foreground' : 'text-muted-foreground';
  if (amount >= 85 && amount < 100) return 'text-foreground';
  return amount >= 60 && amount < 85 ? 'text-foreground-soft' : null;
}

/** Recursively collect .ts and .tsx files under a root, skipping generated, vendored and story folders. */
function collect(root: string, out: string[]): void {
  if (!statSync(root).isDirectory()) {
    out.push(root);
    return;
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(full, out);
    } else if (['.ts', '.tsx'].includes(extname(entry.name)) && !/\.(?:d|test|stories|gen)\.tsx?$/.test(entry.name)) out.push(full);
  }
}

/** The unambiguous rewrites applied to one file's text, each recorded as `old -> new`. */
function rewrite(source: string, changes: string[]): string {
  return source
    .replace(MODIFIER, (match, variants: string, token: string, amount: string) => {
      const next = step(token, Number(amount));
      if (!next) return match;
      changes.push(`${match} -> ${variants}${next}`);
      return `${variants}${next}`;
    })
    .replace(PLACEHOLDER, (match, variant: string) => {
      changes.push(`${match} -> ${variant}:text-faint-foreground`);
      return `${variant}:text-faint-foreground`;
    });
}

type Token = { token: string; offset: number };

/** Whitespace-separated tokens of every string and template piece in `node` and under it. */
function stringTokens(src: ts.SourceFile, node: ts.Node): Token[] {
  const found: Token[] = [];
  (function visit(child: ts.Node) {
    if (ts.isStringLiteralLike(child) || ts.isTemplateHead(child) || ts.isTemplateMiddle(child) || ts.isTemplateTail(child)) {
      for (const match of child.text.matchAll(/\S+/g)) found.push({ token: match[0], offset: child.getStart(src) + 1 + match.index });
    }
    child.forEachChild(visit);
  })(node);
  return found;
}

const parts = (token: string) => token.replace(/^!|!$/g, '').split(':');
const base = (token: string) => parts(token).at(-1) ?? '';
const isRest = (token: string) => parts(token).slice(0, -1).every((variant) => REST_VARIANT.test(variant));
const hasClass = (tokens: Token[], name: RegExp) => tokens.some(({ token }) => name.test(base(token)));

/** Whether visible text sits in this element: a text child or a value such as `{title}`, outside `sr-only` spans. */
function holdsText(src: ts.SourceFile, node: ts.JsxElement | ts.JsxFragment): boolean {
  const inExpression = (expression: ts.Expression): boolean => {
    if (ts.isParenthesizedExpression(expression)) return inExpression(expression.expression);
    if (ts.isJsxElement(expression) || ts.isJsxFragment(expression)) return holdsText(src, expression);
    if (ts.isJsxSelfClosingElement(expression)) return false;
    if (ts.isConditionalExpression(expression)) return inExpression(expression.whenTrue) || inExpression(expression.whenFalse);
    if (ts.isBinaryExpression(expression)) return inExpression(expression.right);
    return !(ts.isIdentifier(expression) && /icon$/i.test(expression.text));
  };
  return node.children.some((child) => {
    if (ts.isJsxText(child)) return child.text.trim() !== '';
    if (ts.isJsxExpression(child)) return !!child.expression && inExpression(child.expression);
    if (ts.isJsxElement(child) && /\bsr-only\b/.test(child.openingElement.attributes.getText(src))) return false;
    return (ts.isJsxElement(child) || ts.isJsxFragment(child)) && holdsText(src, child);
  });
}

/** Lines that need judgment in one file, as `line: what`. */
function judgments(file: string, source: string): string[] {
  const src = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = new Map<number, string>();
  const note = (offset: number, what: string) => {
    const line = src.getLineAndCharacterOfPosition(offset).line + 1;
    if (!found.has(line)) found.set(line, what);
  };
  const isClassName = (node: ts.Node): node is ts.JsxAttribute => ts.isJsxAttribute(node) && node.name.getText(src) === 'className';

  for (const { token, offset } of stringTokens(src, src)) {
    if (LEFT_MODIFIER.test(token) && !token.includes('disabled')) note(offset, `${token}: pick text-foreground-soft, text-muted-foreground or text-faint-foreground`);
    else if (PALETTE.test(token) && !accepts(ACCEPTED.palette, file)) note(offset, `${token}: a palette gray; pick a text step`);
    else if (CASE.test(token) && !accepts(ACCEPTED.case, file)) note(offset, `${token}: labels are sentence case`);
  }

  const judge = (tokens: Token[], tag: string | null, text: boolean) => {
    const dimmed = tokens.find(({ token }) => /^opacity-(?:50|60|70|75|80)$/.test(base(token)) && isRest(token));
    if (dimmed && (text || hasClass(tokens, TEXT_HINT))) note(dimmed.offset, `${dimmed.token}: dims text at rest; color it with a text step`);
    // A control (tab, toggle, chip) changes color with its state; a label does not
    const muted = tokens.find(({ token }) => token === 'text-muted-foreground');
    if (!muted || tokens.some(({ token }) => !isRest(token))) return;
    const small = hasClass(tokens, /^text-(?:xs|sm)$/);
    const large = hasClass(tokens, /^text-(?:base|md|lg|\d?xl)$/);
    if ((tag && LABEL_TAG.test(tag) && !large) || (small && hasClass(tokens, /^font-medium$/))) {
      note(muted.offset, 'a hand-rolled group label; use group-label');
    }
  };
  src.forEachChild(function visit(node) {
    if (isClassName(node)) return;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = opening.tagName.getText(src);
      const className = opening.attributes.properties.find(isClassName);
      if (className && !PICTURE_TAG.test(tag)) judge(stringTokens(src, className), tag, ts.isJsxElement(node) && holdsText(src, node));
    } else if (ts.isStringLiteralLike(node)) judge(stringTokens(src, node), null, false);
    node.forEachChild(visit);
  });
  return [...found].sort(([a], [b]) => a - b).map(([line, what]) => `${line}: ${what}`);
}

function main(): void {
  const [mode, ...roots] = process.argv.slice(2);
  if ((mode !== 'inventory' && mode !== 'rewrite') || roots.length === 0) {
    console.error('Usage: <inventory|rewrite> <roots…>');
    process.exit(1);
  }
  const files: string[] = [];
  for (const root of roots) collect(root, files);
  let rewritten = 0;
  let judged = 0;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const changes: string[] = [];
    const next = rewrite(source, changes);
    const open = judgments(file, next);
    if (changes.length === 0 && open.length === 0) continue;
    console.info(file);
    for (const change of changes) console.info(`  ${mode === 'rewrite' ? 'rewrote' : 'would rewrite'} ${change}`);
    for (const line of open) console.info(`  judge ${line}`);
    if (changes.length > 0) rewritten += 1;
    judged += open.length;
    if (mode === 'rewrite' && changes.length > 0) writeFileSync(file, next);
  }
  console.info(`\n${mode === 'rewrite' ? 'Rewrote' : 'Would rewrite'} ${rewritten} file(s); ${judged} line(s) need judgment, across ${files.length} scanned.`);
  console.info('Never listed: palette grays and case in these template paths.');
  for (const [path, reason] of Object.entries({ ...ACCEPTED.palette, ...ACCEPTED.case })) console.info(`  ${path}: ${reason}`);
}

main();
