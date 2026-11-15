/**
 * Codemod: the files an app owns follow `@cellajs/cli` 0.8.
 *
 * `rewrite` changes:
 *   cella/cella.config.ts                  settings.* and overrides.* -> top level, keeping comments and list order;
 *                                          settings.releaseBase -> trunk; mergePackageJson: true goes, false becomes
 *                                          packageJsonKeys: false
 *   shared/config/vocabulary-allowlist.ts  -> shared/config/style-exceptions.ts: files and prefixes exempt from
 *                                          source-control-term, proseExclude from each prose rule, markerClasses a
 *                                          list with each reason as a comment
 *   a file importing @cellajs/cli          SignedIn -> Session and its cookie string -> header; the a11y base's
 *                                          scope -> states; mintSession's forkPath -> repoRoot
 *   backend/bench/**                       maxErrorRate -> maxErrorShare, the errorRate check id -> errorShare,
 *                                          beforeAll({ skipSeed }) -> beforeAll(), a failed `responses` check -> rejected
 * `inventory` lists those and what needs a hand: an import the CLI no longer exports, a bench call it removed, a base
 * adapter still in the 0.7 shape, a pentest delta whose lists now join the base's.
 *
 * Usage (from the repo root):
 *   pnpm exec tsx cella/alignments/<id>/cli-0-8.ts inventory cella shared/config backend/bench
 *   pnpm exec tsx cella/alignments/<id>/cli-0-8.ts rewrite   cella shared/config backend/bench
 */

import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { parseArgs } from 'node:util';
import ts from 'typescript';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.turbo', 'gen']);
const EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.mjs', '.js']);

const configPath = 'cella/cella.config.ts';
const allowlistPath = 'shared/config/vocabulary-allowlist.ts';
const exceptionsPath = 'shared/config/style-exceptions.ts';
/** The base adapters come with the upgrade; one still in the 0.7 shape is reported, never rewritten. */
const baseAdapters = new Set(['cella/a11y.ts', 'cella/pentest.ts', 'cella/screenshots.ts']);

/** The keys a 0.8 config takes; the CLI refuses any other. */
const configKeys = new Set(['upstreamUrl', 'upstreamBranch', 'upstreamTrack', 'trunk', 'packageJsonKeys', 'fileLinkMode', 'ignored', 'pinned', 'forks']);
/** A wrapper's own comment that names nothing once the wrapper is gone. */
const wrapperComment = /^\/\/\s*(File overrides|Settings)\.?\s*$/i;

/** The rules that skipped the 0.7 `proseExclude` paths. */
const proseRules = [
  'em-dash',
  'contrast-phrase',
  'concrete-language',
  'change-history',
  'review-conversation',
  'load-bearing',
  'authoritative',
  'consequence-tail',
  'code-in-link',
  'long-paragraph',
  'detached-long-comment',
];

/** The doc comment of the template's `shared/config/style-exceptions.ts`. */
const exceptionsDoc = `/**
 * App-owned exceptions for \`pnpm cella style\`, joined to the template's. \`exempt\` lists by rule id the repo-relative files
 * and folders that rule skips, such as a full lucide icon name list (\`shared/json/lucide-icon-names.json\`) under
 * \`source-control-term\`. \`markerClasses\` lists class names the app keeps as hooks with no Tailwind utility or stylesheet
 * rule behind them, each with its reason in a comment.
 */`;

/** Names 0.8 no longer exports, by subpath, with what takes their place. */
const REMOVED: Record<string, Record<string, string>> = {
  '@cellajs/cli/drive': {
    newContext: 'call newContext() on the browser that loadPlaywright() launches',
    openPage: 'open the page on a context of the browser that loadPlaywright() launches',
    requireChromium: 'loadPlaywright() reports a missing browser',
    settle: 'import settle from @cellajs/cli/a11y',
    ContextOptions: 'import type BrowserContextOptions from @cellajs/cli/a11y',
    Playwright: 'type it as Awaited<ReturnType<typeof loadPlaywright>>',
    Browser: 'import the type from playwright',
    BrowserContext: 'import the type from playwright',
    BrowserContextOptions: 'import the type from @cellajs/cli/a11y',
    Page: 'import type Page from @cellajs/cli/a11y',
  },
  '@cellajs/cli/screenshots': { settle: 'import settle from @cellajs/cli/a11y' },
  '@cellajs/cli/pentest': {
    PentestAdapter: 'PentestBase',
    appSchema: 'definePentestApp types the delta; the CLI checks it on load',
    baseSchema: 'definePentestBase types the base; the CLI checks it on load',
  },
  '@cellajs/cli/style': { openRepository: 'drop the call and pass the repo root to repoFiles and loadTailwindNode' },
};
/** The subpaths that exported `SignedIn`. */
const signedInModules = new Set(['@cellajs/cli/a11y', '@cellajs/cli/screenshots']);

type Edit = { start: number; end: number; text: string };
type Outcome = { text: string; notes: string[] };

const parse = (file: string, text: string) =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : /\.m?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS);

const lineNote = (src: ts.SourceFile, node: ts.Node, message: string) => {
  const { line } = src.getLineAndCharacterOfPosition(node.getStart(src));
  return `  by hand ${line + 1}: ${src.text.split('\n')[line].trim()}\n    ${message}`;
};

function applyEdits(text: string, edits: Edit[]): string {
  let next = text;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
  return next;
}

const nameOf = (name: ts.PropertyName | ts.BindingName | undefined) =>
  name && (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) ? name.text : undefined;

/** The range of a list item with its trailing comma, widened to whole lines when it stands alone on them. */
function itemRange(text: string, start: number, end: number): Edit {
  let to = end;
  while (text[to] === ' ' || text[to] === '\t') to += 1;
  to = text[to] === ',' ? to + 1 : end;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  let after = to;
  while (text[after] === ' ' || text[after] === '\t') after += 1;
  if (/^\s*$/.test(text.slice(lineStart, start)) && (text[after] === '\n' || after === text.length)) return { start: lineStart, end: after + 1, text: '' };
  return { start, end: to === end ? to : after, text: '' };
}

/** The leading comments of a node, as source text. */
const commentsBefore = (text: string, pos: number) => (ts.getLeadingCommentRanges(text, pos) ?? []).map(({ pos: from, end }) => text.slice(from, end));

/** The object an `export default` hands over, through `defineX(...)`, `satisfies`, `as` and parentheses. */
function exportedObject(src: ts.SourceFile): ts.ObjectLiteralExpression | undefined {
  const assignment = src.statements.find(ts.isExportAssignment);
  let node: ts.Expression | undefined = assignment?.expression;
  while (node && !ts.isObjectLiteralExpression(node)) {
    if (ts.isCallExpression(node)) node = node.arguments[0];
    else if (ts.isSatisfiesExpression(node) || ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) node = node.expression;
    else return undefined;
  }
  return node;
}

function visit(node: ts.Node, fn: (node: ts.Node) => void): void {
  fn(node);
  ts.forEachChild(node, (child) => visit(child, fn));
}

// cella/cella.config.ts

/** The settings keys that change in place before the wrappers go, or a note when one cannot. */
function configKeyEdits(src: ts.SourceFile, settings: ts.ObjectLiteralExpression): Edit[] | string {
  const edits: Edit[] = [];
  const props = settings.properties;
  const find = (key: string) => props.find((prop): prop is ts.PropertyAssignment => ts.isPropertyAssignment(prop) && nameOf(prop.name) === key);
  const releaseBase = find('releaseBase');
  if (releaseBase) edits.push({ start: releaseBase.name.getStart(src), end: releaseBase.name.getEnd(), text: 'trunk' });
  const merge = find('mergePackageJson');
  if (merge) {
    const value = merge.initializer.kind;
    if (value !== ts.SyntaxKind.TrueKeyword && value !== ts.SyntaxKind.FalseKeyword) return 'settings.mergePackageJson is not a literal: drop it, and write packageJsonKeys: false if it was false';
    const keys = find('packageJsonKeys');
    if (value === ts.SyntaxKind.TrueKeyword || keys) edits.push(itemRange(src.text, merge.getStart(src), merge.getEnd()));
    if (value === ts.SyntaxKind.FalseKeyword) {
      if (keys) edits.push({ start: keys.initializer.getStart(src), end: keys.initializer.getEnd(), text: 'false' });
      else edits.push({ start: merge.getStart(src), end: merge.getEnd(), text: 'packageJsonKeys: false' });
    }
  }
  return edits;
}

/** The wrapper replaced by its own keys, one indent level up, with a comment that names only the wrapper dropped. */
function flattenEdits(src: ts.SourceFile, wrapper: ts.PropertyAssignment, inner: ts.ObjectLiteralExpression): Edit[] {
  const text = src.text;
  const edits: Edit[] = [];
  for (const range of ts.getLeadingCommentRanges(text, wrapper.getFullStart()) ?? []) {
    if (wrapperComment.test(text.slice(range.pos, range.end))) edits.push(itemRange(text, range.pos, range.end));
  }
  const removed = itemRange(text, wrapper.getStart(src), wrapper.getEnd());
  if (inner.properties.length === 0) return [...edits, removed];

  const indentOf = (pos: number) => /^[ \t]*/.exec(text.slice(text.lastIndexOf('\n', pos - 1) + 1))?.[0] ?? '';
  const depth = indentOf(inner.properties[0].getStart(src)).length - indentOf(wrapper.getStart(src)).length;
  const last = inner.properties[inner.properties.length - 1];
  const body = `${text.slice(inner.getStart(src) + 1, last.getEnd())}${inner.properties.hasTrailingComma ? '' : ','}${text.slice(last.getEnd(), inner.getEnd() - 1)}`;
  const lines = body.trim().split('\n');
  const dedented = lines.map((line, index) => (index > 0 && line.startsWith(' '.repeat(depth)) ? line.slice(depth) : line)).join('\n');
  let end = wrapper.getEnd();
  while (text[end] === ' ' || text[end] === '\t') end += 1;
  if (text[end] === ',') end += 1;
  return [...edits, { start: wrapper.getStart(src), end, text: dedented }];
}

/** The config in the flat 0.8 shape, or unchanged with a note when the keys cannot move safely. */
function rewriteConfig(file: string, source: string): Outcome {
  let src = parse(file, source);
  let root = exportedObject(src);
  if (!root) return { text: source, notes: ['  by hand: no `export default defineConfig({ ... })` found; move the settings and overrides keys to the top level'] };
  const wrapperOf = (object: ts.ObjectLiteralExpression, key: string) =>
    object.properties.find((prop): prop is ts.PropertyAssignment => ts.isPropertyAssignment(prop) && nameOf(prop.name) === key);
  const settings = wrapperOf(root, 'settings');
  const overrides = wrapperOf(root, 'overrides');
  if (!settings && !overrides) return { text: source, notes: [] };

  const notes: string[] = [];
  const moved: string[] = [];
  for (const wrapper of [settings, overrides]) {
    if (!wrapper) continue;
    if (!ts.isObjectLiteralExpression(wrapper.initializer)) return { text: source, notes: [lineNote(src, wrapper, `${nameOf(wrapper.name)} is not an object literal: move its keys to the top level`)] };
    for (const prop of wrapper.initializer.properties) {
      const key = ts.isPropertyAssignment(prop) ? nameOf(prop.name) : undefined;
      if (!key) return { text: source, notes: [lineNote(src, prop, 'only `key: value` entries move: move this one by hand')] };
      const next = key === 'releaseBase' ? 'trunk' : key;
      if (key !== 'mergePackageJson') moved.push(next);
      if (key !== 'mergePackageJson' && !configKeys.has(next)) notes.push(lineNote(src, prop, `${key} is no 0.8 config key: the CLI refuses the config until it goes`));
    }
  }
  const topLevel = root.properties.map((prop) => nameOf(prop.name)).filter((key) => key !== 'settings' && key !== 'overrides');
  const clash = moved.filter((key, index) => topLevel.includes(key) || moved.indexOf(key) !== index);
  if (clash.length > 0) return { text: source, notes: [`  by hand: ${clash.join(', ')} would be set twice at the top level: merge the two by hand`] };

  if (settings && ts.isObjectLiteralExpression(settings.initializer)) {
    const edits = configKeyEdits(src, settings.initializer);
    if (typeof edits === 'string') return { text: source, notes: [lineNote(src, settings, edits)] };
    src = parse(file, applyEdits(source, edits));
    root = exportedObject(src) as ts.ObjectLiteralExpression;
  }
  const edits: Edit[] = [];
  for (const key of ['settings', 'overrides']) {
    const wrapper = wrapperOf(root, key);
    if (wrapper && ts.isObjectLiteralExpression(wrapper.initializer)) edits.push(...flattenEdits(src, wrapper, wrapper.initializer));
  }
  return { text: applyEdits(src.text, edits), notes };
}

// shared/config/vocabulary-allowlist.ts

type Item = { comments: string[]; text: string };

/** The elements of an array literal with the comments above each, and the comments after the last one. */
function arrayItems(src: ts.SourceFile, array: ts.ArrayLiteralExpression): { items: Item[]; tail: string[] } {
  const text = src.text;
  const items = array.elements.map((element) => ({ comments: commentsBefore(text, element.getFullStart()), text: element.getText(src) }));
  const last = array.elements[array.elements.length - 1];
  let tailFrom = last ? last.getEnd() : array.getStart(src) + 1;
  while (/\s/.test(text[tailFrom] ?? '')) tailFrom += 1;
  if (text[tailFrom] === ',') tailFrom += 1;
  return { items, tail: commentsBefore(text, tailFrom) };
}

/** A list literal at `indent`, one line when it carries no comment and fits. */
function listText(items: Item[], indent: string, lead: string): string {
  const inline = `[${items.map((item) => item.text).join(', ')}]`;
  if (items.every((item) => item.comments.length === 0) && indent.length + lead.length + inline.length <= 118) return inline;
  const inner = `${indent}  `;
  return `[\n${items.map((item) => [...item.comments.map((comment) => `${inner}${comment}`), `${inner}${item.text},`].join('\n')).join('\n')}\n${indent}]`;
}

/** The 0.8 exceptions file built from the 0.7 allowlist, or a note when the allowlist is not the plain literal shape. */
function exceptionsFrom(file: string, source: string): { text?: string; notes: string[] } {
  const src = parse(file, source);
  const statement = src.statements.find(
    (node): node is ts.VariableStatement =>
      ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => nameOf(declaration.name) === 'vocabularyAllowlist'),
  );
  const declaration = statement?.declarationList.declarations.find((node) => nameOf(node.name) === 'vocabularyAllowlist');
  let value = declaration?.initializer;
  while (value && (ts.isSatisfiesExpression(value) || ts.isAsExpression(value) || ts.isParenthesizedExpression(value))) value = value.expression;
  if (!statement || !value || !ts.isObjectLiteralExpression(value) || statement.declarationList.declarations.length !== 1) {
    return { notes: ['  by hand: no `export const vocabularyAllowlist = { ... }` literal: move the exceptions to shared/config/style-exceptions.ts'] };
  }

  const lists: Record<string, { items: Item[]; comments: string[] }> = {};
  let markers: Item[] = [];
  for (const prop of value.properties) {
    const key = ts.isPropertyAssignment(prop) ? nameOf(prop.name) : undefined;
    const comments = commentsBefore(src.text, prop.getFullStart());
    if (!key || !ts.isPropertyAssignment(prop)) return { notes: [lineNote(src, prop, 'only `key: value` entries convert: move the exceptions by hand')] };
    if (key === 'markerClasses') {
      if (!ts.isObjectLiteralExpression(prop.initializer)) return { notes: [lineNote(src, prop, 'markerClasses is not an object literal')] };
      markers = [];
      let first = true;
      for (const marker of prop.initializer.properties) {
        const name = ts.isPropertyAssignment(marker) ? nameOf(marker.name) : undefined;
        if (!name || !ts.isPropertyAssignment(marker) || !ts.isStringLiteralLike(marker.initializer)) return { notes: [lineNote(src, marker, 'a marker class converts from `name: reason` only')] };
        const reason = marker.initializer.text.trim();
        markers.push({
          comments: [...(first ? comments : []), ...commentsBefore(src.text, marker.getFullStart()), ...(reason ? [`// ${reason}`] : [])],
          text: `'${name}'`,
        });
        first = false;
      }
      continue;
    }
    if (!['files', 'prefixes', 'proseExclude'].includes(key)) return { notes: [lineNote(src, prop, `${key} is no allowlist key: move it by hand`)] };
    if (!ts.isArrayLiteralExpression(prop.initializer)) return { notes: [lineNote(src, prop, `${key} is not an array literal`)] };
    const { items, tail } = arrayItems(src, prop.initializer);
    lists[key] = { items, comments: [...comments, ...tail] };
  }

  const control = [...(lists.files?.items ?? []), ...(lists.prefixes?.items ?? [])];
  const controlComments = [...(lists.files?.comments ?? []), ...(lists.prefixes?.comments ?? [])];
  const prose = lists.proseExclude;
  const exempt: string[] = [];
  if (control.length > 0) exempt.push([...controlComments.map((comment) => `    ${comment}`), `    'source-control-term': ${listText(control, '    ', "'source-control-term': ")},`].join('\n'));
  if (prose && prose.items.length > 0) exempt.push(...proseRules.map((rule) => `    ${rule.includes('-') ? `'${rule}'` : rule}: proseExclude,`));
  const exemptText = exempt.length > 0 ? `{\n${exempt.join('\n')}\n  }` : '{}';
  const markerText = markers.length > 0 ? listText(markers, '  ', 'markerClasses: ') : '[]';
  const body =
    exempt.length === 0 && markers.length === 0
      ? '{ exempt: {}, markerClasses: [] }'
      : `{\n  exempt: ${exemptText},\n  markerClasses: ${markerText},\n}`;
  const proseConst =
    prose && prose.items.length > 0
      ? `${(prose.comments.length > 0 ? prose.comments : ['// The folders the wording, doc and comment rules skip']).join('\n')}\nconst proseExclude = ${listText(prose.items, '', 'const proseExclude = ')};\n\n`
      : '';

  // Everything else in the file stays: its own imports and helpers.
  const kept = src.statements
    .filter((node) => node !== statement)
    .map((node) => {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier) || node.moduleSpecifier.text !== '@cellajs/cli/style') return node.getFullText(src).replace(/^\n+/, '');
      const bindings = node.importClause?.namedBindings;
      const others = bindings && ts.isNamedImports(bindings) ? bindings.elements.filter((element) => element.name.text !== 'VocabularyAllowlist') : [];
      const keyword = node.importClause?.isTypeOnly ? 'import type' : 'import';
      return others.length > 0 ? `${keyword} { ${others.map((element) => element.getText(src)).join(', ')} } from '@cellajs/cli/style';` : '';
    })
    .filter(Boolean);
  const head = ["import type { StyleExceptions } from '@cellajs/cli/style';", ...kept].join('\n');
  return { text: `${head}\n\n${proseConst}${exceptionsDoc}\nexport const styleExceptions: StyleExceptions = ${body};\n`, notes: [] };
}

// Files that import @cellajs/cli

/** The function a parameter belongs to and its body, for a parameter whose value is the 0.7 `SignedIn`. */
type Tracked = { param: ts.ParameterDeclaration; body: ts.Node };

/** `SignedIn` -> `Session` with its `cookie` string read as `header`, the base's `scope` -> `states`, and `forkPath` -> `repoRoot`. */
function rewriteCliImports(file: string, source: string): Outcome {
  const src = parse(file, source);
  const edits: Edit[] = [];
  const notes: string[] = [];
  const imports = src.statements.filter(
    (node): node is ts.ImportDeclaration => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith('@cellajs/cli/'),
  );
  const named = (node: ts.ImportDeclaration) => {
    const bindings = node.importClause?.namedBindings;
    return bindings && ts.isNamedImports(bindings) ? bindings.elements : ts.factory.createNodeArray<ts.ImportSpecifier>();
  };
  const bound = new Set<string>();
  for (const node of src.statements) {
    if (ts.isImportDeclaration(node)) {
      if (node.importClause?.name) bound.add(node.importClause.name.text);
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) bound.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) bound.add(element.name.text);
    }
  }
  const declaresSession = src.statements.some(
    (node) => (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node)) && node.name?.text === 'Session',
  );

  // Names the CLI no longer exports
  for (const node of imports) {
    const removed = REMOVED[(node.moduleSpecifier as ts.StringLiteral).text] ?? {};
    for (const element of named(node)) {
      const hint = removed[(element.propertyName ?? element.name).text];
      if (hint) notes.push(lineNote(src, element, `${(element.propertyName ?? element.name).text} is gone: ${hint}`));
    }
  }

  // SignedIn -> Session
  let signedInLocal: string | undefined;
  for (const node of imports.filter((node) => signedInModules.has((node.moduleSpecifier as ts.StringLiteral).text))) {
    for (const element of named(node)) {
      if ((element.propertyName ?? element.name).text !== 'SignedIn') continue;
      signedInLocal = element.name.text;
      if (element.propertyName) edits.push({ start: element.propertyName.getStart(src), end: element.propertyName.getEnd(), text: 'Session' });
      else if (declaresSession) {
        notes.push(lineNote(src, element, 'the file declares its own Session: rename it, then SignedIn to Session'));
        signedInLocal = undefined;
      } else if (bound.has('Session')) {
        const elements = named(node);
        const index = elements.indexOf(element);
        const next = elements[index + 1];
        const previous = elements[index - 1];
        if (next) edits.push({ start: element.getStart(src), end: next.getStart(src), text: '' });
        else if (previous) edits.push({ start: previous.getEnd(), end: element.getEnd(), text: '' });
        else edits.push(itemRange(source, node.getStart(src), node.getEnd()));
      } else edits.push({ start: element.name.getStart(src), end: element.name.getEnd(), text: 'Session' });
    }
  }

  const tracked: Tracked[] = [];
  if (signedInLocal) {
    const local = signedInLocal;
    const aliased = local !== 'SignedIn';
    visit(src, (node) => {
      if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && node.typeName.text === local) {
        if (!aliased) edits.push({ start: node.typeName.getStart(src), end: node.typeName.getEnd(), text: 'Session' });
        const param = node.parent;
        if (ts.isParameter(param) && param.type === node && ts.isFunctionLike(param.parent) && 'body' in param.parent && param.parent.body) {
          tracked.push({ param, body: param.parent.body });
        }
      }
    });
  }
  // `prepare` and the placeholder resolvers take a SignedIn without saying so
  const root = exportedObject(src);
  const defines = imports.some(
    (node) => signedInModules.has((node.moduleSpecifier as ts.StringLiteral).text) && named(node).some((element) => /^define(A11y|Screenshots)(App|Base)$/.test(element.name.text)),
  );
  if (root && defines) {
    const takers: ts.Expression[] = [];
    for (const prop of root.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      if (nameOf(prop.name) === 'prepare') takers.push(prop.initializer);
      if (nameOf(prop.name) === 'placeholders' && ts.isObjectLiteralExpression(prop.initializer)) {
        for (const resolver of prop.initializer.properties) if (ts.isPropertyAssignment(resolver)) takers.push(resolver.initializer);
      }
    }
    for (const taker of takers) {
      if ((ts.isArrowFunction(taker) || ts.isFunctionExpression(taker)) && taker.parameters[0] && !taker.parameters[0].type) tracked.push({ param: taker.parameters[0], body: taker.body });
    }
  }
  const cookieBinding = (pattern: ts.ObjectBindingPattern) => {
    for (const element of pattern.elements) {
      if (element.propertyName && nameOf(element.propertyName) === 'cookie') edits.push({ start: element.propertyName.getStart(src), end: element.propertyName.getEnd(), text: 'header' });
      else if (!element.propertyName && nameOf(element.name) === 'cookie') edits.push({ start: element.name.getStart(src), end: element.name.getStart(src), text: 'header: ' });
    }
  };
  for (const { param, body } of tracked) {
    if (ts.isObjectBindingPattern(param.name)) {
      cookieBinding(param.name);
      continue;
    }
    if (!ts.isIdentifier(param.name)) continue;
    const user = param.name.text;
    visit(body, (node) => {
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === user && node.name.text === 'cookie') {
        edits.push({ start: node.name.getStart(src), end: node.name.getEnd(), text: 'header' });
      }
      if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer && ts.isIdentifier(node.initializer) && node.initializer.text === user) {
        cookieBinding(node.name);
      }
    });
  }

  // The a11y base's `scope` is `states`
  const base = src.statements.find(
    (node): node is ts.ImportDeclaration => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && /^\.\/a11y(\.ts|\.js)?$/.test(node.moduleSpecifier.text),
  )?.importClause?.name?.text;
  if (base) {
    visit(src, (node) => {
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === base && node.name.text === 'scope') {
        edits.push({ start: node.name.getStart(src), end: node.name.getEnd(), text: 'states' });
      }
      if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer && ts.isIdentifier(node.initializer) && node.initializer.text === base) {
        for (const element of node.name.elements) {
          if (element.propertyName && nameOf(element.propertyName) === 'scope') edits.push({ start: element.propertyName.getStart(src), end: element.propertyName.getEnd(), text: 'states' });
          else if (!element.propertyName && nameOf(element.name) === 'scope') edits.push({ start: element.name.getStart(src), end: element.name.getStart(src), text: 'states: ' });
        }
      }
    });
  }

  // mintSession(email, { forkPath }) -> { repoRoot }
  const mint = imports
    .filter((node) => (node.moduleSpecifier as ts.StringLiteral).text === '@cellajs/cli/drive')
    .flatMap((node) => named(node))
    .find((element) => (element.propertyName ?? element.name).text === 'mintSession')?.name.text;
  if (mint) {
    visit(src, (node) => {
      if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.expression.text !== mint) return;
      const options = node.arguments[1];
      if (!options || !ts.isObjectLiteralExpression(options)) return;
      for (const prop of options.properties) {
        if (ts.isPropertyAssignment(prop) && nameOf(prop.name) === 'forkPath') edits.push({ start: prop.name.getStart(src), end: prop.name.getEnd(), text: 'repoRoot' });
        if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === 'forkPath') edits.push({ start: prop.name.getStart(src), end: prop.name.getStart(src), text: 'repoRoot: ' });
      }
    });
  }

  if (file.endsWith('pentest.app.ts')) {
    notes.push('  by hand: `skip` and `scopeGuards` now join the base\'s lists: keep only the app\'s own entries, and list base entries the app does not have in `remove`');
  }
  return { text: applyEdits(source, edits), notes };
}

/** Notes for a base adapter the upgrade should have brought in the 0.8 shape. */
function baseAdapterNotes(file: string, source: string): string[] {
  const old =
    /\bSignedIn\b/.test(source) || (file === 'cella/a11y.ts' && /^\s{2}scope:\s*\[/m.test(source)) || (file === 'cella/pentest.ts' && /satisfies\s+PentestBase\b/.test(source));
  return old ? [`  by hand: ${file} is still in the 0.7 shape; it comes from the template: take the upgrade's version and port the app's edits to it`] : [];
}

// backend/bench

/** The name a function-like node goes by: its declaration, its variable or its property. */
function functionName(node: ts.SignatureDeclaration): string | undefined {
  if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name) return nameOf(node.name);
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) return nameOf(parent.name);
  return undefined;
}

/** `c.id === 'responses' && !c.ok` with either operand order, for the parameter `c`. */
function isFailedResponses(fn: ts.Expression): boolean {
  if (!ts.isArrowFunction(fn) || fn.parameters.length !== 1 || !ts.isIdentifier(fn.parameters[0].name)) return false;
  const c = fn.parameters[0].name.text;
  const body = fn.body;
  if (!ts.isBinaryExpression(body) || body.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) return false;
  const isId = (node: ts.Expression) =>
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
    [node.left, node.right].some((side) => ts.isPropertyAccessExpression(side) && side.expression.getText() === c && side.name.text === 'id') &&
    [node.left, node.right].some((side) => ts.isStringLiteralLike(side) && side.text === 'responses');
  const isFailed = (node: ts.Expression) =>
    ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken && ts.isPropertyAccessExpression(node.operand) && node.operand.expression.getText() === c && node.operand.name.text === 'ok';
  return (isId(body.left) && isFailed(body.right)) || (isFailed(body.left) && isId(body.right));
}

/** Whether an identifier names a variable, not a property key or member. */
function isReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  if ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent)) && parent.name === node) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  return !(ts.isBindingElement(parent) && parent.propertyName === node);
}

/** How often `name` is read inside `scope`, the nodes in `except` aside. */
function countReads(scope: ts.Node, name: string, except: ts.Node[]): number {
  let reads = 0;
  visit(scope, (node) => {
    if (ts.isIdentifier(node) && node.text === name && isReference(node) && !except.some((skip) => node.pos >= skip.pos && node.end <= skip.end)) reads += 1;
  });
  return reads;
}

function rewriteBench(file: string, source: string): Outcome {
  const src = parse(file, source);
  const text = src.text;
  const edits: Edit[] = [];
  const notes: string[] = [];

  visit(src, (node) => {
    // maxErrorRate -> maxErrorShare
    if ((ts.isPropertyAssignment(node) || ts.isPropertySignature(node)) && nameOf(node.name) === 'maxErrorRate') {
      edits.push({ start: node.name.getStart(src), end: node.name.getEnd(), text: ts.isStringLiteral(node.name) ? "'maxErrorShare'" : 'maxErrorShare' });
    }
    if (ts.isShorthandPropertyAssignment(node) && node.name.text === 'maxErrorRate') edits.push({ start: node.name.getStart(src), end: node.name.getStart(src), text: 'maxErrorShare: ' });
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'maxErrorRate') edits.push({ start: node.name.getStart(src), end: node.name.getEnd(), text: 'maxErrorShare' });

    // The check id errorRate -> errorShare
    if (ts.isStringLiteralLike(node) && node.text === 'errorRate') {
      const parent = node.parent;
      const comparesId =
        ts.isBinaryExpression(parent) &&
        [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(parent.operatorToken.kind) &&
        [parent.left, parent.right].some((side) => ts.isPropertyAccessExpression(side) && side.name.text === 'id');
      if (comparesId) edits.push({ start: node.getStart(src) + 1, end: node.getEnd() - 1, text: 'errorShare' });
      else notes.push(lineNote(src, node, "the check id errorRate is errorShare"));
    }

    // Calls the runner no longer offers
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const { expression: target, name } = node.expression;
      const owner = target.getText(src);
      if (name.text === 'ws' && /(^|\.)vu$/.test(owner)) notes.push(lineNote(src, node, 'vu.ws is gone: open the socket with the WebSocket global'));
      if ((name.text === 'put' || name.text === 'request') && /(^|\.)http$/.test(owner)) notes.push(lineNote(src, node, `http.${name.text} is gone: use get, post, patch or delete`));
    }

    if (!ts.isFunctionLike(node) || !('body' in node) || !node.body) return;
    const fn = node as ts.FunctionLikeDeclaration & { body: ts.Node };

    // beforeAll({ skipSeed }) -> beforeAll()
    const [first] = fn.parameters;
    if (functionName(fn) === 'beforeAll' && first && ts.isObjectBindingPattern(first.name)) {
      const element = first.name.elements.find((item) => nameOf(item.propertyName ?? item.name) === 'skipSeed');
      if (element && ts.isIdentifier(element.name)) {
        const local = element.name.text;
        const spreads: ts.SpreadElement[] = [];
        visit(fn.body, (inner) => {
          if (!ts.isSpreadElement(inner) || !ts.isArrayLiteralExpression(inner.parent)) return;
          let expression = inner.expression;
          while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
          if (ts.isConditionalExpression(expression) && ts.isIdentifier(expression.condition) && expression.condition.text === local) spreads.push(inner);
        });
        if (first.name.elements.length > 1) notes.push(lineNote(src, first, 'beforeAll takes no argument in 0.8: drop the parameter'));
        else if (countReads(fn.body, local, spreads) > 0) notes.push(lineNote(src, first, `beforeAll takes no argument in 0.8: drop ${local}, and the hint it chose; the CLI prints "seed skipped" itself`));
        else {
          edits.push({ start: first.getStart(src), end: fn.parameters.hasTrailingComma ? text.indexOf(',', first.getEnd()) + 1 : first.getEnd(), text: '' });
          for (const spread of spreads) edits.push(itemRange(text, spread.getStart(src), spread.getEnd()));
        }
      }
    }

  });

  // checks.some((c) => c.id === 'responses' && !c.ok) -> rejected, from the outcome the enclosing function destructures
  visit(src, (node) => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== 'some') return;
    if (node.arguments.length !== 1 || !isFailedResponses(node.arguments[0])) return;
    const target = node.expression.expression;
    if (ts.isPropertyAccessExpression(target) && target.name.text === 'checks') {
      edits.push({ start: node.getStart(src), end: node.getEnd(), text: `${target.expression.getText(src)}.rejected` });
      return;
    }
    let owner: ts.Node | undefined = node.parent;
    let binding: ts.BindingElement | undefined;
    for (; owner && !binding; owner = owner.parent) {
      if (!ts.isFunctionLike(owner) || !ts.isIdentifier(target)) continue;
      for (const param of owner.parameters) {
        if (!ts.isObjectBindingPattern(param.name)) continue;
        binding = param.name.elements.find((item) => nameOf(item.propertyName ?? item.name) === 'checks' && nameOf(item.name) === target.text);
        if (binding) break;
      }
      if (binding) break;
    }
    if (!binding || !owner || !ts.isObjectBindingPattern(binding.parent)) {
      notes.push(lineNote(src, node, 'a failed responses check is `rejected` on the run outcome'));
      return;
    }
    edits.push({ start: node.getStart(src), end: node.getEnd(), text: 'rejected' });
    const pattern = binding.parent;
    if (pattern.elements.some((item) => nameOf(item.propertyName ?? item.name) === 'rejected')) return;
    if (countReads(owner, binding.name.getText(src), [node, binding]) === 0 && !binding.propertyName && !binding.initializer) {
      edits.push({ start: binding.getStart(src), end: binding.getEnd(), text: 'rejected' });
    } else {
      const last = pattern.elements[pattern.elements.length - 1];
      edits.push({ start: last.getEnd(), end: last.getEnd(), text: ', rejected' });
    }
  });

  // Two rules that meet on one node keep the first edit: the next run takes the rest
  const overlaps = (a: Edit, b: Edit) => a.start < b.end && b.start < a.end;
  const accepted: Edit[] = [];
  for (const edit of edits) {
    const duplicate = accepted.some((other) => other.start === edit.start && other.end === edit.end && other.text === edit.text);
    if (!duplicate && accepted.every((other) => !overlaps(other, edit))) accepted.push(edit);
  }
  return { text: applyEdits(text, accepted), notes };
}

// Runner

/** Recursively collect script files under a root, skipping generated and vendored folders. */
function collect(root: string, out: string[]): void {
  if (!existsSync(root)) return;
  if (!statSync(root).isDirectory()) {
    out.push(root);
    return;
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(full, out);
    } else if (EXTENSIONS.has(extname(entry.name)) && !entry.name.endsWith('.d.ts')) out.push(full);
  }
}

function main(): void {
  const { positionals } = parseArgs({ allowPositionals: true });
  const [mode, ...roots] = positionals;
  if ((mode !== 'inventory' && mode !== 'rewrite') || roots.length === 0) {
    console.error('Usage: <inventory|rewrite> <roots…>');
    process.exit(1);
  }
  const write = mode === 'rewrite';
  const files: string[] = [];
  for (const root of roots) collect(root, files);
  const paths = [...new Set(files.map((file) => relative(process.cwd(), file).split(sep).join('/')))].sort();
  let changed = 0;
  let manual = 0;

  const report = (file: string, verb: string | null, notes: string[]) => {
    if (!verb && notes.length === 0) return;
    console.info(`${file}${verb ? ` (${verb})` : ''}`);
    for (const note of notes) console.info(note);
    manual += notes.length;
  };

  for (const file of paths) {
    const source = readFileSync(file, 'utf8');
    if (file === allowlistPath) {
      if (existsSync(exceptionsPath)) {
        report(file, null, [`  by hand: ${exceptionsPath} exists too, and the CLI reads it alone: move what this file still lists there and delete it`]);
        continue;
      }
      const { text, notes } = exceptionsFrom(file, source);
      report(`${file} -> ${exceptionsPath}`, text ? (write ? 'moved' : 'would move') : null, notes);
      if (text) {
        changed += 1;
        if (write) {
          writeFileSync(exceptionsPath, text);
          unlinkSync(file);
        }
      }
      continue;
    }
    if (baseAdapters.has(file)) {
      report(file, null, baseAdapterNotes(file, source));
      continue;
    }

    let next = source;
    const notes: string[] = [];
    const step = (outcome: Outcome) => {
      next = outcome.text;
      notes.push(...outcome.notes);
    };
    if (file === configPath) step(rewriteConfig(file, next));
    if (/from\s+['"]@cellajs\/cli\//.test(next)) step(rewriteCliImports(file, next));
    if (file.startsWith('backend/bench/') || /from\s+['"]@cellajs\/cli\/bench['"]/.test(next)) step(rewriteBench(file, next));
    if (/(from\s+|import\(\s*)['"][^'"]*vocabulary-allowlist(\.ts)?['"]/.test(next)) notes.push(`  by hand: imports ${allowlistPath}, which moves to ${exceptionsPath} as styleExceptions`);

    const didChange = next !== source;
    report(file, didChange ? (write ? 'rewrote' : 'would rewrite') : null, notes);
    if (didChange) {
      changed += 1;
      if (write) writeFileSync(file, next);
    }
  }
  console.info(`\n${write ? 'Rewrote' : 'Would rewrite'} ${changed} file(s); ${manual} note(s) need a hand, across ${paths.length} scanned.`);
}

main();
