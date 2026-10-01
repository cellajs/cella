/**
 * Flags frontend class names that compile to no CSS: typos, utilities the theme lacks, and markers nothing selects.
 * A class passes when the Tailwind design system compiles it, a stylesheet under frontend/src defines or selects it,
 * a script or an arbitrary Tailwind selector references it, or `markerClasses` lists it.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { type Finding, repoRoot } from './repo-files.ts';
import { parseSource } from './source-comments.ts';

/** Class names no frontend stylesheet, script or class string selects, each with the reason it stays. */
const markerClasses: Record<string, string> = {
  'not-prose': 'opts a subtree out of the typography plugin, whose prose rules exclude `.not-prose` descendants',
};

/** Third-party class prefixes: the library's own stylesheet or DOM code reads them. */
const libraryPrefixes: Record<string, string> = {
  'bn-': 'BlockNote editor parts',
  rdg: 'data grid rows, cells and states',
};

/** Calls whose arguments are class values; object keys are class names and object values conditions, as in clsx. */
const classFunctions = new Set(['clsx', 'cn', 'cx', 'tw', 'twJoin', 'twMerge']);
const classNamePattern = /^(?:class|classes|className|classNames|classList)$|[a-z](?:Class|Classes|Class[Nn]ames?|ClassList)$/;
const groupPattern = /^(?:group|peer)(?:\/[\w-]+)?$/;
const tailwindImport = /@import\s+['"]tailwindcss(?:\/[\w.-]+)?['"]/;

interface DesignSystem {
  candidatesToCss(classes: string[]): (string | null)[];
}

interface TailwindNode {
  __unstable__loadDesignSystem(css: string, options: { base: string }): Promise<DesignSystem>;
}

/** The loaded design system plus the class names that stylesheets, scripts and arbitrary selectors use. */
export interface TailwindContext {
  /** Repo-relative stylesheet that imports Tailwind. */
  entry: string;
  /** Absent when loading failed, as on an `@apply` of an unknown class; `loadError` then holds Tailwind's message. */
  designSystem?: DesignSystem;
  loadError?: string;
  knownClasses: Set<string>;
  compiles: Map<string, boolean>;
}

type Mode = 'class' | 'clsx';

/** Text of one string or template piece in a class position; `open*` marks a side that touches a `${...}` placeholder. */
interface ClassText {
  start: number;
  text: string;
  raw: string;
  openStart: boolean;
  openEnd: boolean;
}

const isFrontendScript = (file: string) => /^frontend\/src\/.*\.tsx?$/.test(file) && !file.endsWith('.d.ts') && !file.includes('.gen.');
const isFrontendStylesheet = (file: string) => /^frontend\/src\/.*\.css$/.test(file);

/** Test files pass made-up class names to check prop forwarding and merging. */
const isClassSource = (file: string) => isFrontendScript(file) && !/\.test\.tsx?$/.test(file);

/** `@tailwindcss/node` from the frontend package, directly or through `@tailwindcss/vite`, which depends on it. */
function loadTailwindNode(): TailwindNode {
  const frontendRequire = createRequire(join(repoRoot, 'frontend/package.json'));
  let path: string;
  try {
    path = frontendRequire.resolve('@tailwindcss/node');
  } catch {
    path = createRequire(frontendRequire.resolve('@tailwindcss/vite')).resolve('@tailwindcss/node');
  }
  return createRequire(path)(path) as TailwindNode;
}

function addMatches(target: Set<string>, text: string, pattern: RegExp): void {
  for (const match of text.matchAll(pattern)) target.add(match[1]);
}

/** Class names a stylesheet selects, a script queries or toggles, or an arbitrary selector such as `group-[.x]` names. */
function usedClassNames(files: string[]): Set<string> {
  const names = new Set<string>();
  for (const file of files.filter(isFrontendStylesheet)) {
    const css = readFileSync(join(repoRoot, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    addMatches(names, css, /(?<!\\)\.(-?[_a-zA-Z][\w-]*)/g);
  }
  for (const file of files.filter(isFrontendScript)) {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    // Arbitrary selectors (`group-[.x]`, `[&_.x]`); a bracket after a name, `)`, `]` or `?.` indexes code.
    for (const [chunk] of source.matchAll(/(?<![\w$)\]?.])\[[^\s'"`]*/g)) addMatches(names, chunk, /(?<![a-zA-Z0-9$.)\]?!])\.(-?[_a-zA-Z][\w-]*)/g);
    // Selector strings for querySelector, closest and the like.
    for (const [, , text] of source.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
      if (/^[\w\s.#>+~,:()[\]="*-]+$/.test(text)) addMatches(names, text, /(?:^|[\s>+~,(])\.(-?[_a-zA-Z][\w-]*)/g);
    }
    for (const [, args] of source.matchAll(/(?:classList\.(?:add|contains|remove|replace|toggle)|getElementsByClassName)\(([^)]*)\)/g)) {
      for (const [, text] of args.matchAll(/['"`]([^'"`]+)['"`]/g)) for (const name of text.split(/\s+/)) names.add(name);
    }
  }
  return names;
}

/** The design system from the frontend stylesheet that imports Tailwind; undefined in a repo without one. */
export async function tailwindContext(files: string[]): Promise<TailwindContext | undefined> {
  const entry = files.filter(isFrontendStylesheet).find((file) => tailwindImport.test(readFileSync(join(repoRoot, file), 'utf8')));
  if (!entry) return undefined;
  const path = join(repoRoot, entry);
  const knownClasses = usedClassNames(files);
  for (const name of Object.keys(markerClasses)) knownClasses.add(name);
  const context: TailwindContext = { entry, knownClasses, compiles: new Map() };
  try {
    context.designSystem = await loadTailwindNode().__unstable__loadDesignSystem(readFileSync(path, 'utf8'), { base: dirname(path) });
  } catch (error) {
    context.loadError = error instanceof Error ? error.message : String(error);
  }
  return context;
}

function propertyName(name: ts.PropertyName | ts.BindingName | undefined): string | undefined {
  return name && (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isPrivateIdentifier(name)) ? name.text : undefined;
}

const isClassNamed = (...names: (string | undefined)[]) => names.some((name) => name !== undefined && classNamePattern.test(name));

/** Strings in class positions: class attributes, class helper calls, cva, `tw` templates and class-named values. */
function classTexts(sourceFile: ts.SourceFile): ClassText[] {
  const texts: ClassText[] = [];
  const add = (node: ts.StringLiteralLike | ts.TemplateLiteralLikeNode, openStart = false, openEnd = false) => {
    const start = node.getStart(sourceFile) + 1;
    const end = node.end - (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) ? 2 : 1);
    texts.push({ start, text: node.text, raw: sourceFile.text.slice(start, end), openStart, openEnd });
  };
  const addKey = (name: ts.Node) => {
    if (ts.isStringLiteral(name)) add(name);
    else if (ts.isIdentifier(name))
      texts.push({ start: name.getStart(sourceFile), text: name.text, raw: name.text, openStart: false, openEnd: false });
    else walk(name);
  };

  function collectTemplate(node: ts.TemplateExpression): void {
    add(node.head, false, true);
    let before = node.head.text;
    for (const [index, span] of node.templateSpans.entries()) {
      const last = index === node.templateSpans.length - 1;
      // A placeholder holds whole classes only when whitespace or the string edge separates it from the text around it.
      const leftClosed = /\s$/.test(before) || (index === 0 && before === '');
      const rightClosed = /^\s/.test(span.literal.text) || (last && span.literal.text === '');
      if (leftClosed && rightClosed) collect(span.expression, 'class');
      else walk(span.expression);
      add(span.literal, true, !last);
      before = span.literal.text;
    }
  }

  function collectObject(node: ts.ObjectLiteralExpression, mode: Mode): void {
    for (const property of node.properties) {
      if (mode === 'clsx' && (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))) {
        addKey(property.name);
        if (ts.isPropertyAssignment(property)) walk(property.initializer);
      } else if (ts.isPropertyAssignment(property)) {
        walk(property.name);
        collect(property.initializer, 'class');
      } else walk(property);
    }
  }

  function collectCva(node: ts.CallExpression): void {
    const [base, config, ...rest] = node.arguments;
    collect(base, 'class');
    for (const argument of rest) walk(argument);
    if (!config || !ts.isObjectLiteralExpression(config)) {
      walk(config);
      return;
    }
    for (const property of config.properties) {
      if (!ts.isPropertyAssignment(property) || propertyName(property.name) !== 'variants' || !ts.isObjectLiteralExpression(property.initializer)) {
        walk(property);
        continue;
      }
      for (const variant of property.initializer.properties) {
        if (ts.isPropertyAssignment(variant) && ts.isObjectLiteralExpression(variant.initializer)) collectObject(variant.initializer, 'class');
        else walk(variant);
      }
    }
  }

  function calleeName(node: ts.CallExpression): string | undefined {
    const callee = node.expression;
    return ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
  }

  /** Whether `node` starts a class position, collecting it when it does. */
  function collectCall(node: ts.CallExpression, mode?: Mode): boolean {
    const name = calleeName(node);
    if (name === 'cva') collectCva(node);
    else if (name && classFunctions.has(name)) {
      walk(node.expression);
      for (const argument of node.arguments) collect(argument, 'clsx');
    } else if (mode && (name === 'join' || name === 'filter') && ts.isPropertyAccessExpression(node.expression)) {
      collect(node.expression.expression, mode);
      for (const argument of node.arguments) walk(argument);
    } else return false;
    return true;
  }

  function collectReturns(node: ts.FunctionLikeDeclaration, mode: Mode): void {
    for (const parameter of node.parameters) walk(parameter);
    if (node.body && !ts.isBlock(node.body)) collect(node.body, mode);
    else walk(node.body, mode);
  }

  function collect(node: ts.Node | undefined, mode: Mode): void {
    if (!node) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node);
    else if (ts.isTemplateExpression(node)) collectTemplate(node);
    else if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isSpreadElement(node) ||
      ts.isJsxExpression(node)
    )
      collect(node.expression, mode);
    else if (ts.isConditionalExpression(node)) {
      walk(node.condition);
      collect(node.whenTrue, mode);
      collect(node.whenFalse, mode);
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      walk(node.left);
      collect(node.right, mode);
    } else if (ts.isBinaryExpression(node) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) {
      collect(node.left, mode);
      collect(node.right, mode);
    } else if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) collect(element, mode);
    } else if (ts.isObjectLiteralExpression(node)) collectObject(node, mode);
    else if (ts.isElementAccessExpression(node)) {
      collect(node.expression, mode);
      walk(node.argumentExpression);
    } else if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) collectReturns(node, mode);
    else if (!ts.isCallExpression(node) || !collectCall(node, mode)) walk(node);
  }

  /** Collects `node` when it starts a class position; `returns` is set inside a class-named function. */
  function collectStart(node: ts.Node, returns?: Mode): boolean {
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && isClassNamed(node.name.text)) collect(node.initializer, 'class');
    else if (ts.isCallExpression(node)) return collectCall(node);
    else if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && node.tag.text === 'tw') collect(node.template, 'class');
    else if (ts.isReturnStatement(node) && returns) collect(node.expression, returns);
    // Storybook argTypes describe controls (`className: { control: 'text' }`), never classes.
    else if (ts.isPropertyAssignment(node) && propertyName(node.name) === 'argTypes') return true;
    else if (
      (ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node) || ts.isPropertyDeclaration(node) || ts.isParameter(node)) &&
      node.initializer &&
      isClassNamed(propertyName(node.name))
    ) {
      walk(node.name);
      collect(node.initializer, 'class');
    } else if (ts.isBindingElement(node) && node.initializer && isClassNamed(propertyName(node.name), propertyName(node.propertyName))) {
      collect(node.initializer, 'class');
    } else if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && isClassNamed(propertyName(node.name))) {
      collectReturns(node, 'class');
    } else return false;
    return true;
  }

  /** Visits `node` and its children looking for class positions. */
  function walk(node: ts.Node | undefined, returns?: Mode): void {
    if (!node || ts.isTypeNode(node) || collectStart(node, returns)) return;
    const inner = ts.isFunctionLike(node) ? undefined : returns;
    ts.forEachChild(node, (child) => walk(child, inner));
  }

  walk(sourceFile);
  return texts;
}

/** Whole tokens of `text` with their offsets; a token touching an open side is part of a dynamic class and skipped. */
function tokens({ start, text, raw, openStart, openEnd }: ClassText): { token: string; offset: number }[] {
  const result: { token: string; offset: number }[] = [];
  for (const match of text.matchAll(/\S+/g)) {
    const end = match.index + match[0].length;
    if ((openStart && match.index === 0) || (openEnd && end === text.length)) continue;
    result.push({ token: match[0], offset: start + (raw === text ? match.index : Math.max(0, raw.indexOf(match[0]))) });
  }
  return result;
}

/** `token` without its variants and important marker: `md:hover:x!` gives `x`. */
function baseClass(token: string): string {
  let depth = 0;
  let separator = -1;
  for (let index = 0; index < token.length; index++) {
    const char = token[index];
    if (char === '[' || char === '(') depth++;
    else if (char === ']' || char === ')') depth--;
    else if (char === ':' && depth === 0) separator = index;
  }
  return token.slice(separator + 1).replace(/^!|!$/g, '');
}

function compiles(context: TailwindContext, designSystem: DesignSystem, candidates: string[]): void {
  const unknown = [...new Set(candidates)].filter((candidate) => !context.compiles.has(candidate));
  const css = designSystem.candidatesToCss(unknown);
  for (const [index, candidate] of unknown.entries()) context.compiles.set(candidate, css[index] !== null);
}

/** Why `token` produces nothing, or undefined when Tailwind compiles it or it is a known non-Tailwind class. */
function problem(context: TailwindContext, token: string): string | undefined {
  if (context.compiles.get(token) || groupPattern.test(token) || context.knownClasses.has(token)) return undefined;
  if (Object.keys(libraryPrefixes).some((prefix) => token.startsWith(prefix))) return undefined;
  const base = baseClass(token);
  if (base !== token && (context.knownClasses.has(base) || groupPattern.test(base))) {
    return `${base} is a plain CSS class, so variants and ! do not apply to it; define it with @utility`;
  }
  return 'Tailwind compiles no CSS for it and no stylesheet or script selects it; fix the name, or add a marker class to markerClasses in shared/scripts/check-tailwind-classes.ts';
}

/**
 * Class names in one frontend file that compile to no CSS; `context` comes from `tailwindContext`. Tailwind itself
 * rejects an `@apply` of an unknown class while loading, which this reports on the entry stylesheet.
 */
export function tailwindFindings(file: string, source: string, context: TailwindContext | undefined): Finding[] {
  if (!context) return [];
  const { designSystem, loadError } = context;
  if (!designSystem)
    return file === context.entry ? [{ file, rule: 'tailwind-class', message: `Tailwind cannot load this stylesheet: ${loadError}` }] : [];
  if (!isClassSource(file)) return [];
  const sourceFile = parseSource(file, source);
  const found = classTexts(sourceFile).flatMap(tokens);
  compiles(
    context,
    designSystem,
    found.map(({ token }) => token),
  );
  return found.flatMap(({ token, offset }) => {
    const message = problem(context, token);
    if (!message) return [];
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(offset);
    return [{ file, line: line + 1, column: character + 1, rule: 'tailwind-class', term: token, message }];
  });
}
