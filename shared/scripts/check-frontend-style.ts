/**
 * Enforces frontend conventions Biome cannot express reliably. Components are named function declarations, also
 * inside wrappers such as `memo`; component values are typed `ComponentType<Props>`, never `FC`; zustand stores are
 * read through a selector, never a bare `useStore()` call. Export docs follow the cella/AGENTS.md comment budget.
 */
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import ts from 'typescript';
import { isRequested, repoFiles, repoRoot } from './repo-files.ts';

const requestedRoots = process.argv.slice(2);
const failures: string[] = [];
const storeNames = new Set<string>();

function trackedFrontendFiles(): string[] {
  return repoFiles()
    .filter((file) => file.startsWith('frontend/src/') && /\.(?:ts|tsx)$/.test(file))
    .filter((file) => !file.includes('.gen.'))
    .filter((file) => !file.includes('/content/'))
    .filter((file) => !file.includes('/stories/'))
    .filter((file) => !/\.(?:stories|test)\.tsx?$/.test(file));
}

function lineAndColumn(sourceFile: ts.SourceFile, offset: number): string {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(offset);
  return `${line + 1}:${character + 1}`;
}

function report(sourceFile: ts.SourceFile, node: ts.Node, rule: string, message: string): void {
  failures.push(`${sourceFile.fileName}:${lineAndColumn(sourceFile, node.getStart(sourceFile))} [${rule}] ${message}`);
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

function checkReactComponentType(sourceFile: ts.SourceFile, node: ts.Node): void {
  if (!ts.isTypeReferenceNode(node)) return;
  const name = node.typeName.getText(sourceFile);
  if (!['FC', 'FunctionComponent', 'React.FC', 'React.FunctionComponent'].includes(name)) return;
  report(
    sourceFile,
    node,
    'react-component-type',
    'declare components with functions; use ComponentType<Props> when a component is stored as a value',
  );
}

function checkVariableStatement(sourceFile: ts.SourceFile, node: ts.VariableStatement): void {
  if (extname(sourceFile.fileName) !== '.tsx') return;
  for (const declaration of node.declarationList.declarations) {
    const name = ts.isIdentifier(declaration.name) ? declaration.name.text : null;
    const initializer = declaration.initializer;
    if (!name || !/^[A-Z]/.test(name) || !initializer || !containsJsx(initializer)) continue;

    if (ts.isArrowFunction(initializer)) {
      report(
        sourceFile,
        declaration,
        'component-declaration',
        `${name} is an ordinary component; use a named function declaration`,
      );
      continue;
    }

    if (!ts.isCallExpression(initializer)) continue;
    const wrappedRender = initializer.arguments.find(
      (argument): argument is ts.ArrowFunction | ts.FunctionExpression =>
        (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) && containsJsx(argument),
    );
    if (!wrappedRender || (ts.isFunctionExpression(wrappedRender) && wrappedRender.name?.text === name)) continue;
    report(
      sourceFile,
      wrappedRender,
      'component-declaration',
      `${name} is wrapped by a component helper; use a named function expression`,
    );
  }
}

function collectStores(sourceFile: ts.SourceFile): void {
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
      if (ts.isIdentifier(declaration.name)) storeNames.add(declaration.name.text);
    }
  }
}

function checkStoreSelector(sourceFile: ts.SourceFile, node: ts.Node): void {
  if (!ts.isCallExpression(node) || node.arguments.length > 0 || !ts.isIdentifier(node.expression)) return;
  const name = node.expression.text;
  if (!storeNames.has(name)) return;
  report(
    sourceFile,
    node,
    'store-selector',
    `${name}() subscribes to every field; select the values this component reads`,
  );
}

const sourceFiles = trackedFrontendFiles().map((file) =>
  ts.createSourceFile(
    file,
    readFileSync(join(repoRoot, file), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    extname(file) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  ),
);
for (const sourceFile of sourceFiles) collectStores(sourceFile);

for (const sourceFile of sourceFiles.filter((sourceFile) => isRequested(sourceFile.fileName, requestedRoots))) {
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) checkVariableStatement(sourceFile, statement);
  }
  sourceFile.forEachChild(function visit(node) {
    checkReactComponentType(sourceFile, node);
    checkStoreSelector(sourceFile, node);
    node.forEachChild(visit);
  });
}

if (failures.length > 0) {
  console.error(`[frontend:style] ${failures.length} violation(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(
  '[frontend:style] OK, component declarations, component types and store reads follow the frontend conventions.',
);
