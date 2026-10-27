/**
 * Codemod: buttons follow shadcn's base-vega recipes; the `plain` and `none` button variants are gone.
 *
 * `rewrite` turns `'plain'` into `'secondary'` wherever it picks a button variant: the `variant` prop of `<Button>` or of a
 * component named `*Button` (a ternary or `{'plain'}` included) and the `variant` option of `buttonVariants()`.
 * `inventory` lists those rewrites and what needs judgment, which no mode rewrites:
 *   variant="none"                         -> ghost, or a native <button>, whichever keeps the look
 *   'plain' in another `variant` value      -> secondary when it feeds a button; Badge and Alert keep plain
 *   a button className that sets a fill, an edge color or a text color -> the variant owns color
 *   a button className that sets a one-side edge (border-b) or drops the edge (border-0) -> every button has a 1px edge now
 *   a neutral hover off the model           -> hover:bg-muted on a pressable, hover:bg-accent on a navigable item
 *   a data-dropdowner-active: fill          -> data-dropdowner-active:bg-muted
 *   styling/app.css setting --secondary, --accent, --muted or --brand
 *   a `// fork:` marker in ui/button.tsx, ui/dialog.tsx, ui/alert.tsx, ui/toast.tsx, ui/chip.tsx or common/close-button.tsx
 *
 * Usage (from the repo root):
 *   pnpm exec tsx cella/alignments/<id>/button-variants.ts inventory frontend/src
 *   pnpm exec tsx cella/alignments/<id>/button-variants.ts rewrite   frontend/src
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import ts from 'typescript';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.turbo', 'gen', 'stories']);
const FORKED_FILES = ['modules/ui/button.tsx', 'modules/ui/dialog.tsx', 'modules/ui/alert.tsx', 'modules/ui/toast.tsx', 'modules/ui/chip.tsx', 'modules/common/close-button.tsx'];

const COLOR = {
  fill: /^bg-(?!(?:clip|origin|blend|size|position|repeat|linear|radial|conic)-|(?:none|cover|contain|auto|fixed|local|scroll|no-repeat|repeat|center|top|bottom|left|right)$)/,
  edge: /^border-(?:[trblxyse]-)?(?![trblxyse](?:-|$)|\d|px$|\[\d|spacing|(?:solid|dashed|dotted|double|hidden|none|collapse|separate)$)/,
  text: /^text-(?!\[\d|(?:2xs|xs|sm|base|md|lg|\d?xl|left|center|right|start|end|justify|wrap|nowrap|balance|pretty|ellipsis|clip)$)/,
};
const CHILD_VARIANT = /^(?:\[&|\*|before$|after$|placeholder$|selection$|marker$|file$)/;
const MODEL_STATE_FILL = /^bg-(?:accent|muted|sidebar-accent)$/;
const NEUTRAL_HOVER = /^bg-(?:accent|foreground|muted)\/[\w.[\]]+$/;
const TOKENS_IN_APP_CSS = /^\s*--(secondary|accent|muted|brand):/gm;
const SIDE_EDGE = /^border-[trblxyse](?:-(?:[1-9]\d*|px))?$/;
const NO_EDGE = /^border-(?:0|none)$/;

const parts = (token: string) => token.replace(/^!|!$/g, '').split(':');
const base = (token: string) => parts(token).at(-1) ?? '';
const variants = (token: string) => parts(token).slice(0, -1);

/** Whether a class sets a color a button variant owns; the model's own state fills pass. */
function restyles(token: string): boolean {
  const on = variants(token);
  if (on.some((variant) => CHILD_VARIANT.test(variant))) return false;
  if (MODEL_STATE_FILL.test(base(token)) && on.length > 0 && !on.includes('hover')) return false;
  return Object.values(COLOR).some((utility) => utility.test(base(token)));
}

/** The base-vega replacement for a neutral hover off the model, or null when the class is on it. */
function hoverReplacement(token: string): string | null {
  const on = variants(token);
  const isHover = on.some((variant) => /(?:^|-)hover(?:\/|$)/.test(variant));
  if (!isHover) return null;
  if (base(token) === 'bg-secondary' && on.length === 1) return 'hover:bg-muted, or nothing on a secondary button: it has its own hover';
  if (!NEUTRAL_HOVER.test(base(token)) || base(token) === 'bg-muted/50') return null;
  return 'hover:bg-muted on a pressable, hover:bg-accent on a navigable item, hover:bg-sidebar-accent in the sidebar, hover:bg-muted/50 on a table row';
}

/** Recursively collect .ts, .tsx and .css files under a root, skipping generated, vendored and story folders. */
function collect(root: string, out: string[]): void {
  if (!statSync(root).isDirectory()) {
    out.push(root);
    return;
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(full, out);
    } else if (['.ts', '.tsx', '.css'].includes(extname(entry.name)) && !/\.(?:d|test|stories|gen)\.tsx?$/.test(entry.name)) out.push(full);
  }
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

/** String literals `'plain'` under a node, not inside a nested JSX element. */
function plainLiterals(node: ts.Node): ts.StringLiteral[] {
  const found: ts.StringLiteral[] = [];
  (function visit(child: ts.Node) {
    if (ts.isStringLiteral(child) && child.text === 'plain') found.push(child);
    else if (!ts.isJsxElement(child) && !ts.isJsxSelfClosingElement(child)) child.forEachChild(visit);
  })(node);
  return found;
}

type Edit = { start: number; end: number; text: string };

/** The rewrites and the judgment lines of one source file. */
function scan(file: string, source: string): { edits: Edit[]; changes: string[]; open: string[] } {
  const src = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits: Edit[] = [];
  const changes: string[] = [];
  const found = new Map<number, string>();
  const line = (offset: number) => src.getLineAndCharacterOfPosition(offset).line + 1;
  const note = (offset: number, what: string) => {
    if (!found.has(line(offset))) found.set(line(offset), what);
  };
  const rewritten = new Set<ts.Node>();
  const rewritePlain = (node: ts.Node) => {
    for (const literal of plainLiterals(node)) {
      rewritten.add(literal);
      edits.push({ start: literal.getStart(src) + 1, end: literal.getEnd() - 1, text: 'secondary' });
      changes.push(`${line(literal.getStart(src))}: 'plain' -> 'secondary'`);
    }
  };
  const judgeClasses = (tokens: Token[]) => {
    const restyled = tokens.filter(({ token }) => restyles(token));
    const edge = tokens.find(({ token }) => SIDE_EDGE.test(base(token)) || NO_EDGE.test(base(token)));
    if (edge) {
      note(edge.offset, `${edge.token}: every button has a 1px transparent edge on each side now; an edge color colors all four, a border-0 shrinks it`);
    } else if (restyled.length > 0) {
      const list = restyled.map(({ token }) => token).join(' ');
      note(restyled[0].offset, `button className sets color (${list}): drop what the variant covers; keep width, margin, radius, reveal opacity`);
    }
  };

  for (const { token, offset } of stringTokens(src, src)) {
    const replacement = hoverReplacement(token);
    if (replacement) note(offset, `${token}: ${replacement}`);
    else if (variants(token).includes('data-dropdowner-active') && base(token).startsWith('bg-') && base(token) !== 'bg-muted') {
      note(offset, `${token}: an open trigger takes data-dropdowner-active:bg-muted`);
    }
  }

  src.forEachChild(function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = opening.tagName.getText(src);
      const attribute = (name: string) =>
        opening.attributes.properties.find((property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText(src) === name);
      const variant = attribute('variant');
      const isButton = /(?:^|\.)\w*Button$/.test(tag);
      if (variant?.initializer && isButton) {
        rewritePlain(variant.initializer);
        if (/['"]none['"]/.test(variant.initializer.getText(src))) note(variant.getStart(src), 'variant="none" is gone: ghost keeps a hover fill, a native <button> keeps none');
      }
      const render = attribute('render')?.initializer;
      const rendersButton = render && ts.isJsxExpression(render) && render.expression && /<Button\b/.test(render.expression.getText(src));
      const className = attribute('className');
      if (className && (tag === 'Button' || rendersButton)) judgeClasses(stringTokens(src, className));
    } else if (ts.isCallExpression(node) && node.expression.getText(src) === 'buttonVariants') {
      const [options] = node.arguments;
      if (options && ts.isObjectLiteralExpression(options)) {
        for (const property of options.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const name = property.name.getText(src);
          if (name === 'variant') rewritePlain(property.initializer);
          if (name === 'variant' && /['"]none['"]/.test(property.initializer.getText(src))) note(property.getStart(src), "variant 'none' is gone: use ghost");
          if (name === 'className') judgeClasses(stringTokens(src, property.initializer));
        }
      }
      if (ts.isCallExpression(node.parent)) judgeClasses(node.parent.arguments.filter((argument) => argument !== node).flatMap((argument) => stringTokens(src, argument)));
    } else if (ts.isPropertyAssignment(node) && node.name.getText(src) === 'variant') {
      for (const literal of plainLiterals(node.initializer)) {
        if (!rewritten.has(literal)) note(literal.getStart(src), "'plain' variant: 'secondary' when this feeds a button; Badge and Alert keep plain");
      }
    }
    node.forEachChild(visit);
  });
  const open = [...found].sort(([a], [b]) => a - b).map(([at, what]) => `${at}: ${what}`);
  return { edits, changes, open };
}

/** Judgment lines for a stylesheet: theme tokens whose role this change sets. */
function scanCss(file: string, source: string): string[] {
  if (!file.endsWith('styling/app.css')) return [];
  return [...source.matchAll(TOKENS_IN_APP_CSS)].map((match) => {
    const at = source.slice(0, match.index).split('\n').length;
    const role =
      match[1] === 'brand'
        ? '--brand now defaults to var(--primary): drop it where it repeats --primary, keep it for an identity color apart from primary'
        : `--${match[1]} is a neutral fill now (secondary: lower-emphasis filled buttons, muted: the pressable hover, accent: the highlighted item); a tint shows on every one`;
    return `${at}: ${role}`;
  });
}

function main(): void {
  const [mode, ...roots] = process.argv.slice(2);
  if ((mode !== 'inventory' && mode !== 'rewrite') || roots.length === 0) {
    console.error('Usage: <inventory|rewrite> <roots…>');
    process.exit(1);
  }
  const files: string[] = [];
  for (const root of roots) collect(root, files);
  let rewrittenFiles = 0;
  let judged = 0;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const { edits, changes, open } = file.endsWith('.css') ? { edits: [], changes: [], open: scanCss(file, source) } : scan(file, source);
    if (FORKED_FILES.some((path) => file.endsWith(path)) && source.includes('// fork:')) {
      open.unshift('0: a forked copy of a changed primitive: merge the upstream version by hand, keeping your marked lines');
    }
    if (changes.length === 0 && open.length === 0) continue;
    console.info(file);
    for (const change of changes) console.info(`  ${mode === 'rewrite' ? 'rewrote' : 'would rewrite'} ${change}`);
    for (const line of open) console.info(`  judge ${line}`);
    if (changes.length > 0) rewrittenFiles += 1;
    judged += open.length;
    if (mode === 'rewrite' && edits.length > 0) {
      const next = [...edits].sort((a, b) => b.start - a.start).reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source);
      writeFileSync(file, next);
    }
  }
  console.info(`\n${mode === 'rewrite' ? 'Rewrote' : 'Would rewrite'} ${rewrittenFiles} file(s); ${judged} line(s) need judgment, across ${files.length} scanned.`);
}

main();
