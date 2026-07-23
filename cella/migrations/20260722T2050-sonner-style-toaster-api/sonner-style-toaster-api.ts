/**
 * Codemod: convert Cella's positional toaster severity to Sonner-style methods.
 *
 * Usage from the repository root:
 *   pnpm exec tsx cella/migrations/<id>/sonner-style-toaster-api.ts inventory frontend/src
 *   pnpm exec tsx cella/migrations/<id>/sonner-style-toaster-api.ts rewrite frontend/src
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const defaultModule = '~/modules/common/toaster/toaster';
const severities = new Set(['success', 'error', 'info', 'warning']);
const extensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
const skipDirectories = new Set(['.git', '.turbo', 'build', 'coverage', 'dist', 'node_modules']);

interface Rewrite {
  end: number;
  severity: string;
  start: number;
  text: string;
}

/** A call the codemod cannot safely classify without project-specific type information. */
export interface SkippedCall {
  column: number;
  expression: string;
  line: number;
  reason: string;
}

/** Result of transforming one JavaScript or TypeScript source file. */
export interface TransformResult {
  output: string;
  rewrites: number;
  rewritesBySeverity: Record<string, number>;
  skipped: SkippedCall[];
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (file.endsWith('.js')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function matchesModule(specifier: string, modules: Set<string>): boolean {
  return modules.has(specifier) || specifier.endsWith('/modules/common/toaster/toaster');
}

function importedBindings(sourceFile: ts.SourceFile, modules: Set<string>): Set<string> {
  const bindings = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!matchesModule(statement.moduleSpecifier.text, modules)) continue;
    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;
    for (const element of namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (importedName === 'toaster') bindings.add(element.name.text);
    }
  }
  return bindings;
}

function bindingContains(name: ts.BindingName, identifier: string): boolean {
  if (ts.isIdentifier(name)) return name.text === identifier;
  return name.elements.some((element) => !ts.isOmittedExpression(element) && bindingContains(element.name, identifier));
}

function hasNestedDeclaration(sourceFile: ts.SourceFile, identifier: string): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      (ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
      bindingContains(node.name, identifier)
    ) {
      found = true;
      return;
    }
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isClassDeclaration(node) ||
        ts.isClassExpression(node)) &&
      node.name?.text === identifier
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return found;
}

function argumentText(source: string, sourceFile: ts.SourceFile, argument: ts.Expression): string {
  return source.slice(argument.getFullStart(), argument.getEnd()).trim();
}

function callText(
  source: string,
  sourceFile: ts.SourceFile,
  callee: string,
  severity: string,
  message: ts.Expression,
  options: ts.Expression | undefined,
): string {
  const target = severity === 'default' ? callee : `${callee}.${severity}`;
  const messageText = argumentText(source, sourceFile, message);
  const args = options ? `${messageText}, ${argumentText(source, sourceFile, options)}` : messageText;
  return `${target}(${args})`;
}

/** Transform legacy toaster calls in one source string. */
export function transformSource(
  source: string,
  file = 'source.ts',
  moduleSpecifiers: Iterable<string> = [defaultModule],
): TransformResult {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
  const bindings = importedBindings(sourceFile, new Set(moduleSpecifiers));
  const shadowedBindings = new Set([...bindings].filter((binding) => hasNestedDeclaration(sourceFile, binding)));
  const edits: Rewrite[] = [];
  const skipped: SkippedCall[] = [];

  const skip = (node: ts.CallExpression, reason: string): void => {
    const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    skipped.push({
      line: location.line + 1,
      column: location.character + 1,
      reason,
      expression: node.getText(sourceFile).replace(/\s+/g, ' '),
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && bindings.has(node.expression.text)) {
      const callee = node.expression.text;
      if (shadowedBindings.has(callee)) {
        skip(node, `the imported binding '${callee}' is shadowed elsewhere in this file`);
      } else if (node.arguments.length >= 2) {
        const [message, severityNode, options] = node.arguments;
        const severity =
          ts.isStringLiteral(severityNode) || ts.isNoSubstitutionTemplateLiteral(severityNode)
            ? severityNode.text
            : undefined;

        if (severity && (severities.has(severity) || severity === 'default')) {
          if (node.arguments.length > 3) skip(node, 'legacy toaster calls accept at most three arguments');
          else {
            edits.push({
              start: node.getStart(sourceFile),
              end: node.getEnd(),
              severity,
              text: callText(source, sourceFile, callee, severity, message, options),
            });
          }
        } else if (severity) skip(node, `unsupported severity '${severity}'`);
        else if (!ts.isObjectLiteralExpression(severityNode) && severityNode.kind !== ts.SyntaxKind.UndefinedKeyword) {
          skip(node, 'dynamic second argument; verify whether it is a severity or Sonner options');
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  let output = source;
  const rewritesBySeverity: Record<string, number> = {};
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    output = `${output.slice(0, edit.start)}${edit.text}${output.slice(edit.end)}`;
    rewritesBySeverity[edit.severity] = (rewritesBySeverity[edit.severity] ?? 0) + 1;
  }

  return { output, rewrites: edits.length, rewritesBySeverity, skipped };
}

function collectFiles(root: string, output: string[]): void {
  const stats = statSync(root);
  if (!stats.isDirectory()) {
    if (extensions.has(extname(root))) output.push(root);
    return;
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && skipDirectories.has(entry.name)) continue;
    const file = join(root, entry.name);
    if (entry.isDirectory()) collectFiles(file, output);
    else if (extensions.has(extname(entry.name)) && !entry.name.includes('.gen.')) output.push(file);
  }
}

function parseArguments(args: string[]): { mode: 'inventory' | 'rewrite'; modules: Set<string>; roots: string[] } {
  const [mode, ...rest] = args;
  if (mode !== 'inventory' && mode !== 'rewrite') {
    throw new Error('Usage: <inventory|rewrite> <roots...> [--module <specifier>]');
  }

  const modules = new Set([defaultModule]);
  const roots: string[] = [];
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--module') {
      const specifier = rest[index + 1];
      if (!specifier) throw new Error('--module requires an import specifier');
      modules.add(specifier);
      index += 1;
    } else roots.push(rest[index]);
  }
  if (roots.length === 0) throw new Error('Pass at least one source root, for example frontend/src.');
  return { mode, modules, roots };
}

function main(): void {
  let parsed: ReturnType<typeof parseArguments>;
  try {
    parsed = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  const files: string[] = [];
  for (const root of parsed.roots) collectFiles(root, files);

  let changedFiles = 0;
  let rewriteCount = 0;
  const rewriteCounts: Record<string, number> = {};
  const skipped: Array<SkippedCall & { file: string }> = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const result = transformSource(source, file, parsed.modules);
    rewriteCount += result.rewrites;
    for (const [severity, count] of Object.entries(result.rewritesBySeverity)) {
      rewriteCounts[severity] = (rewriteCounts[severity] ?? 0) + count;
    }
    skipped.push(...result.skipped.map((item) => ({ ...item, file })));
    if (result.output === source) continue;
    changedFiles += 1;
    if (parsed.mode === 'rewrite') writeFileSync(file, result.output);
  }

  const verb = parsed.mode === 'rewrite' ? 'Rewrote' : 'Would rewrite';
  console.info(`${verb} ${rewriteCount} call(s) in ${changedFiles} file(s) across ${files.length} scanned.`);
  for (const [severity, count] of Object.entries(rewriteCounts).sort()) {
    console.info(`  ${severity}: ${count}`);
  }
  if (skipped.length > 0) {
    console.info(`Skipped ${skipped.length} ambiguous call(s) for manual review:`);
    for (const item of skipped) {
      console.info(`  ${item.file}:${item.line}:${item.column} ${item.reason}\n    ${item.expression}`);
    }
  }
}

const entryFile = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (entryFile === fileURLToPath(import.meta.url)) main();
