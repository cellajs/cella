/**
 * Enforces frontend declaration conventions that Biome cannot express reliably. Export
 * descriptions are not required here: the comment budget in cella/AGENTS.md governs which
 * exports earn a doc.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = join(fileURLToPath(new URL('../..', import.meta.url)));
const requestedRoots = process.argv.slice(2);
const failures: string[] = [];

function trackedFrontendFiles(): string[] {
  return execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'frontend/src'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    .filter((file) => existsSync(join(repoRoot, file)))
    .filter((file) => /\.(?:ts|tsx)$/.test(file))
    .filter((file) => !file.includes('.gen.'))
    .filter((file) => !file.includes('/content/'))
    .filter((file) => !file.includes('/stories/'))
    .filter((file) => !/\.(?:stories|test)\.tsx?$/.test(file));
}

function isRequested(file: string): boolean {
  if (requestedRoots.length === 0) return true;
  return requestedRoots.some((root) => {
    const normalized = root.replace(/^\.\//, '').replace(/\/$/, '');
    return file === normalized || file.startsWith(`${normalized}/`);
  });
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

for (const file of trackedFrontendFiles().filter(isRequested)) {
  const source = readFileSync(join(repoRoot, file), 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    extname(file) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) checkVariableStatement(sourceFile, statement);
  }
  sourceFile.forEachChild(function visit(node) {
    checkReactComponentType(sourceFile, node);
    node.forEachChild(visit);
  });
}

if (failures.length > 0) {
  console.error(`[frontend:style] ${failures.length} violation(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log('[frontend:style] OK, component declarations follow the frontend conventions.');
