/**
 * Enforces frontend conventions Biome cannot express reliably: named function components, `ComponentType<Props>` values,
 * stores and route context read through a selector, `press={false}` on a Button, `formResolver` and `noValidate` on a
 * form, a drag grip through the reorder handle. Each check below states its rule.
 */
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import ts from 'typescript';
import { type Finding, repoRoot } from './repo-files.ts';
import { parseSource } from './source-comments.ts';

type Report = (node: ts.Node, rule: string, message: string) => void;

/** App sources under frontend/src, outside generated files, content, stories and tests. */
function isFrontendSource(file: string): boolean {
  return (
    /^frontend\/src\/.*\.tsx?$/.test(file) &&
    !file.includes('.gen.') &&
    !file.includes('/content/') &&
    !file.includes('/stories/') &&
    !/\.(?:stories|test)\.tsx?$/.test(file)
  );
}

function containsJsx(node: ts.Node): boolean {
  let found = false;
  function visit(child: ts.Node): void {
    if (found) return;
    if (ts.isJsxElement(child) || ts.isJsxFragment(child) || ts.isJsxSelfClosingElement(child)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  }
  visit(node);
  return found;
}

function checkReactComponentType(sourceFile: ts.SourceFile, node: ts.Node, report: Report): void {
  if (!ts.isTypeReferenceNode(node)) return;
  const name = node.typeName.getText(sourceFile);
  if (!['FC', 'FunctionComponent', 'React.FC', 'React.FunctionComponent'].includes(name)) return;
  report(node, 'react-component-type', 'declare components with functions; use ComponentType<Props> when a component is stored as a value');
}

function checkVariableStatement(sourceFile: ts.SourceFile, node: ts.VariableStatement, report: Report): void {
  if (extname(sourceFile.fileName) !== '.tsx') return;
  for (const declaration of node.declarationList.declarations) {
    const name = ts.isIdentifier(declaration.name) ? declaration.name.text : null;
    const initializer = declaration.initializer;
    if (!name || !/^[A-Z]/.test(name) || !initializer || !containsJsx(initializer)) continue;

    if (ts.isArrowFunction(initializer)) {
      report(declaration, 'component-declaration', `${name} is an ordinary component; use a named function declaration`);
      continue;
    }

    if (!ts.isCallExpression(initializer)) continue;
    const wrappedRender = initializer.arguments.find(
      (argument): argument is ts.ArrowFunction | ts.FunctionExpression =>
        (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) && containsJsx(argument),
    );
    if (!wrappedRender || (ts.isFunctionExpression(wrappedRender) && wrappedRender.name?.text === name)) continue;
    report(wrappedRender, 'component-declaration', `${name} is wrapped by a component helper; use a named function expression`);
  }
}

function collectStores(sourceFile: ts.SourceFile, stores: Set<string>): void {
  const createNames = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (statement.moduleSpecifier.text !== 'zustand' || !bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if ((element.propertyName ?? element.name).text === 'create') createNames.add(element.name.text);
    }
  }
  if (createNames.size === 0) return;
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      let callee: ts.Node | undefined = declaration.initializer;
      while (callee && ts.isCallExpression(callee)) callee = callee.expression;
      if (!callee || !ts.isIdentifier(callee) || !createNames.has(callee.text)) continue;
      if (ts.isIdentifier(declaration.name)) stores.add(declaration.name.text);
    }
  }
}

function checkStoreSelector(node: ts.Node, stores: Set<string>, report: Report): void {
  if (!ts.isCallExpression(node) || node.arguments.length > 0 || !ts.isIdentifier(node.expression)) return;
  const name = node.expression.text;
  if (!stores.has(name)) return;
  report(node, 'store-selector', `${name}() subscribes to every field; select the values this component reads`);
}

/**
 * Route context is rebuilt on every navigation, search-only ones included, so a component that reads it whole renders
 * again on each one. `select` narrows the read to a value that stays equal between navigations.
 */
function checkRouteContextSelector(node: ts.Node, report: Report): void {
  if (!ts.isCallExpression(node)) return;
  const callee = node.expression;
  const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : undefined;
  if (name !== 'useRouteContext') return;
  const [options] = node.arguments;
  // Options passed by name or spread have their `select` elsewhere
  if (options && (!ts.isObjectLiteralExpression(options) || options.properties.some(ts.isSpreadAssignment))) return;
  if (options?.properties.some((property) => property.name?.getText() === 'select')) return;
  report(
    node,
    'route-context-selector',
    'useRouteContext() renders again on every navigation; pass `select` and return the id or flag this component reads',
  );
}

/**
 * A Button's press nudge is a `transform` (`active:press`). `active:translate-y-0` sets `translate`, another property,
 * so it compiles and leaves the nudge in place; `press={false}` turns the nudge off.
 */
function checkButtonPressCancel(sourceFile: ts.SourceFile, node: ts.Node, report: Report): void {
  if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return;
  if (node.tagName.getText(sourceFile) !== 'Button') return;
  for (const attribute of node.attributes.properties) {
    if (!ts.isJsxAttribute(attribute) || attribute.name.getText(sourceFile) !== 'className' || !attribute.initializer) continue;
    if (!/(?<![\w:-])!?active:translate-y-0!?(?![\w-])/.test(attribute.initializer.getText(sourceFile))) continue;
    report(
      attribute,
      'button-press-cancel',
      'active:translate-y-0 does not cancel the press nudge, which is a transform; pass press={false} to the Button',
    );
  }
}

/**
 * A form react-hook-form validates shows why a field is refused under that field. Without `noValidate` the browser
 * refuses an email or web address first, in a bubble of its own and in the browser's language.
 */
function checkFormNoValidate(sourceFile: ts.SourceFile, node: ts.Node, report: Report): void {
  if ((!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) || node.tagName.getText(sourceFile) !== 'form') return;
  const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
  const onSubmit = attributes.find((attribute) => attribute.name.getText(sourceFile) === 'onSubmit');
  if (!onSubmit?.initializer?.getText(sourceFile).includes('handleSubmit(')) return;
  if (attributes.some((attribute) => attribute.name.getText(sourceFile) === 'noValidate')) return;
  report(node, 'form-no-validate', 'a form react-hook-form validates takes noValidate, so its fields say what is wrong, not the browser');
}

/** A form resolves through `formResolver`, which leaves a cleared optional field unset; it is the one reader of `zodResolver`. */
function checkFormResolver(file: string, node: ts.Node, report: Report): void {
  if (file === 'frontend/src/utils/form-resolver.ts' || !ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return;
  if (node.moduleSpecifier.text !== '@hookform/resolvers/zod') return;
  report(node, 'form-resolver', 'resolve a form with formResolver from ~/utils/form-resolver, which leaves a cleared optional field unset');
}

/**
 * A drag grip renders through `ReorderHandle` or `reorderColumn`, which give it the arrow keys and the move menu. A drag
 * preview (`*-preview.tsx`) only pictures the grip, and the editor's block handle moves blocks from its own menu.
 */
function checkReorderGrip(file: string, sourceFile: ts.SourceFile, report: Report): void {
  if (file.endsWith('-preview.tsx') || file === 'frontend/src/modules/common/blocknote/custom-side-menu/side-menu.tsx') return;
  let grip: ts.Node | undefined;
  let hasHandle = false;
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text;
      if (statement.moduleSpecifier.text === 'lucide-react' && /^Grip(Vertical|Horizontal)Icon$/.test(imported)) grip = element;
      if (imported === 'ReorderHandle' || imported === 'reorderColumn') hasHandle = true;
    }
  }
  if (grip && !hasHandle) {
    report(
      grip,
      'reorder-grip',
      'render a drag grip through ReorderHandle or reorderColumn, so the keyboard and a pointer that cannot drag move it too',
    );
  }
}

/**
 * A memo whose dependency array names a value its callback never reads. The React Compiler memoizes on what the callback
 * reads, so that value stops triggering a recompute and the result goes stale; derive the result from the value itself.
 */
function checkMemoDependencies(node: ts.Node, report: Report): void {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return;
  if (node.expression.text !== 'useMemo' && node.expression.text !== 'useCallback') return;
  const [callback, dependencies] = node.arguments;
  if (!callback || !dependencies || !ts.isArrayLiteralExpression(dependencies)) return;
  // A callback passed by name has its body elsewhere
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) return;

  const read = new Set<string>();
  callback.forEachChild(function collect(child) {
    if (ts.isIdentifier(child)) read.add(child.text);
    child.forEachChild(collect);
  });
  for (const dependency of dependencies.elements) {
    let root: ts.Expression = dependency;
    while (ts.isPropertyAccessExpression(root) || ts.isElementAccessExpression(root) || ts.isNonNullExpression(root) || ts.isCallExpression(root)) {
      root = root.expression;
    }
    if (!ts.isIdentifier(root) || read.has(root.text)) continue;
    report(
      dependency,
      'memo-dependency-unread',
      `${root.text} is a dependency the callback never reads, so the compiled memo ignores it; read it or derive the result from it`,
    );
  }
}

/** The zustand stores the frontend creates, read from every frontend file so a path-limited run still knows them. */
export function frontendStores(files: string[]): Set<string> {
  const stores = new Set<string>();
  for (const file of files.filter(isFrontendSource)) {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    if (source.includes('zustand')) collectStores(parseSource(file, source), stores);
  }
  return stores;
}

/** Convention findings in one frontend file; `stores` comes from `frontendStores`. */
export function frontendFindings(file: string, source: string, stores: Set<string>): Finding[] {
  if (!isFrontendSource(file)) return [];
  const sourceFile = parseSource(file, source);
  const findings: Finding[] = [];
  const report: Report = (node, rule, message) => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    findings.push({ file, line: line + 1, column: character + 1, rule, message });
  };

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) checkVariableStatement(sourceFile, statement, report);
  }
  checkReorderGrip(file, sourceFile, report);
  sourceFile.forEachChild(function visit(node) {
    checkReactComponentType(sourceFile, node, report);
    checkStoreSelector(node, stores, report);
    checkRouteContextSelector(node, report);
    checkButtonPressCancel(sourceFile, node, report);
    checkFormNoValidate(sourceFile, node, report);
    checkFormResolver(file, node, report);
    checkMemoDependencies(node, report);
    node.forEachChild(visit);
  });
  return findings;
}
