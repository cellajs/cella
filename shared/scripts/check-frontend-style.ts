/**
 * Enforces frontend conventions Biome cannot express reliably. Components are named function declarations, also
 * inside wrappers such as `memo`; component values are typed `ComponentType<Props>`, never `FC`; zustand stores are
 * read through a selector, never a bare `useStore()` call.
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
  sourceFile.forEachChild(function visit(node) {
    checkReactComponentType(sourceFile, node, report);
    checkStoreSelector(node, stores, report);
    node.forEachChild(visit);
  });
  return findings;
}
