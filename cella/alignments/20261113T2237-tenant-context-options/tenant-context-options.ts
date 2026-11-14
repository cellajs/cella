/**
 * Codemod: the request tenant transactions take `{ tenantId, includeDeleted }` as a third argument.
 *
 * `rewrite` changes every call of a removed export, on one line or many, and the imports that name one:
 *   tenantReadAs(ctx, id, fn)                   -> tenantRead(ctx, fn, { tenantId: id })
 *   tenantReadAsIncludingDeleted(ctx, id, fn)   -> tenantRead(ctx, fn, { tenantId: id, includeDeleted: true })
 *   tenantReadIncludingDeleted(ctx, fn)         -> tenantRead(ctx, fn, { includeDeleted: true })
 *   tenantContextIncludingDeleted(ctx, fn)      -> tenantContext(ctx, fn, { includeDeleted: true })
 *   tenantReadUnlessInTransaction(ctx, fn)      -> tenantRead(ctx, fn)
 * A selection `const read = range ? tenantReadIncludingDeleted : tenantRead` goes, and each `read(ctx, fn)` in its
 * scope becomes `tenantRead(ctx, fn, { includeDeleted: !!range })`.
 * `inventory` lists those rewrites and every other use of a removed name, which needs a hand rewrite.
 *
 * Usage (from the repo root):
 *   pnpm exec tsx cella/alignments/<id>/tenant-context-options.ts inventory backend/src
 *   pnpm exec tsx cella/alignments/<id>/tenant-context-options.ts rewrite   backend/src backend/tests
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import ts from 'typescript';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.turbo', 'gen']);

type Variant = { to: string; tenantArg: boolean; includeDeleted: boolean };

/** Each removed name: the call it becomes, whether it takes a tenant id argument, and whether it reaches tombstones. */
const RENAMES: Record<string, Variant> = {
  tenantReadAsIncludingDeleted: { to: 'tenantRead', tenantArg: true, includeDeleted: true },
  tenantReadAs: { to: 'tenantRead', tenantArg: true, includeDeleted: false },
  tenantReadIncludingDeleted: { to: 'tenantRead', tenantArg: false, includeDeleted: true },
  tenantContextIncludingDeleted: { to: 'tenantContext', tenantArg: false, includeDeleted: true },
  tenantReadUnlessInTransaction: { to: 'tenantRead', tenantArg: false, includeDeleted: false },
};
/** The kept exports a selection can pair with a removed one. */
const KEPT: Record<string, Variant> = {
  tenantRead: { to: 'tenantRead', tenantArg: false, includeDeleted: false },
  tenantContext: { to: 'tenantContext', tenantArg: false, includeDeleted: false },
};
const ANY_USE = new RegExp(`\\b(${Object.keys(RENAMES).join('|')})\\b`);

/** A text replacement; `selection` marks a rewritten call of a selection's variable. */
type Edit = { start: number; end: number; text: string; selection?: ts.VariableStatement };
type Selection = { variant: Variant; includeDeleted: string; statement: ts.VariableStatement };

/** The call in the new signature, or null when the arguments do not match the removed one. */
function newCall(src: ts.SourceFile, variant: Variant, args: readonly ts.Expression[], includeDeleted: string | null): string | null {
  if (args.some(ts.isSpreadElement)) return null;
  const [ctx, ...rest] = args.map((arg) => arg.getText(src));
  const tenantId = variant.tenantArg ? rest.shift() : undefined;
  const [fn, extra] = rest;
  if (!ctx || !fn || extra !== undefined) return null;
  const options = [
    ...(tenantId ? [tenantId === 'tenantId' ? 'tenantId' : `tenantId: ${tenantId}`] : []),
    ...(includeDeleted ? [`includeDeleted: ${includeDeleted}`] : []),
  ];
  return `${variant.to}(${[ctx, fn, ...(options.length ? [`{ ${options.join(', ')} }`] : [])].join(', ')})`;
}

/** `const x = cond ? a : b` over two exports that differ only in tombstones, or null. */
function selectionOf(src: ts.SourceFile, statement: ts.Statement): [string, Selection] | null {
  if (!ts.isVariableStatement(statement) || statement.declarationList.declarations.length !== 1) return null;
  const [declaration] = statement.declarationList.declarations;
  const init = declaration.initializer;
  if (!ts.isIdentifier(declaration.name) || !init || !ts.isConditionalExpression(init)) return null;
  const [whenTrue, whenFalse] = [init.whenTrue, init.whenFalse].map((branch) => (ts.isIdentifier(branch) ? (RENAMES[branch.text] ?? KEPT[branch.text]) : undefined));
  if (!whenTrue || !whenFalse || whenTrue.to !== whenFalse.to || whenTrue.tenantArg !== whenFalse.tenantArg) return null;
  if (whenTrue.includeDeleted === whenFalse.includeDeleted) return null;
  const condition = init.condition.getText(src);
  const operand = ts.isIdentifier(init.condition) || ts.isPropertyAccessExpression(init.condition) ? condition : `(${condition})`;
  return [declaration.name.text, { variant: whenTrue, includeDeleted: whenTrue.includeDeleted ? `!!${operand}` : `!${operand}`, statement }];
}

/** The selection a callee name refers to: the nearest enclosing block that declares it. */
function resolveSelection(src: ts.SourceFile, name: string, from: ts.Node): Selection | undefined {
  for (let node: ts.Node | undefined = from; node; node = node.parent) {
    if (!ts.isBlock(node) && !ts.isSourceFile(node)) continue;
    for (const statement of node.statements) {
      const found = selectionOf(src, statement);
      if (found?.[0] === name) return found[1];
    }
  }
  return undefined;
}

/** The statement's whole lines, so removing it leaves no blank indented line. */
function statementLines(src: ts.SourceFile, statement: ts.Statement): Edit {
  const start = src.text.lastIndexOf('\n', statement.getStart(src) - 1) + 1;
  const end = statement.getEnd();
  return { start, end: src.text[end] === '\n' ? end + 1 : end, text: '' };
}

/** How often a selection's variable is named in its block, its declaration aside. */
function countUses(src: ts.SourceFile, statement: ts.VariableStatement): number {
  const declared = statement.declarationList.declarations[0].name;
  const name = declared.getText(src);
  let uses = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === name && node !== declared) uses += 1;
    ts.forEachChild(node, visit);
  };
  visit(statement.parent);
  return uses;
}

/** The edits of one pass over a parsed file. */
function collectEdits(src: ts.SourceFile): Edit[] {
  const edits: Edit[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === '#/db/tenant-context') {
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings) && bindings.elements.some((element) => RENAMES[element.name.text] && !element.propertyName)) {
        const names = bindings.elements.map((element) => (element.propertyName ? element.getText(src) : (RENAMES[element.name.text]?.to ?? element.name.text)));
        const next = [...new Set(names)].sort((a, b) => a.localeCompare(b));
        edits.push({ start: bindings.getStart(src), end: bindings.getEnd(), text: `{ ${next.join(', ')} }` });
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      const selection = RENAMES[name] ? undefined : resolveSelection(src, name, node);
      const call = RENAMES[name]
        ? newCall(src, RENAMES[name], node.arguments, RENAMES[name].includeDeleted ? 'true' : null)
        : selection && newCall(src, selection.variant, node.arguments, selection.includeDeleted);
      if (call) edits.push({ start: node.getStart(src), end: node.getEnd(), text: call, selection: selection?.statement });
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return edits;
}

/** The rewritten source; inner edits go first and an outer call follows in a later pass. */
function rewriteSource(file: string, source: string): string {
  let text = source;
  for (let pass = 0; pass < 10; pass += 1) {
    const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const accepted: Edit[] = [];
    for (const edit of collectEdits(src).sort((a, b) => a.end - a.start - (b.end - b.start))) {
      if (accepted.every((other) => edit.end <= other.start || edit.start >= other.end)) accepted.push(edit);
    }
    // A selection goes in the pass that rewrites every use of its variable.
    const calls = new Map<ts.VariableStatement, number>();
    for (const { selection } of accepted) if (selection) calls.set(selection, (calls.get(selection) ?? 0) + 1);
    for (const [statement, count] of calls) if (countUses(src, statement) === count) accepted.push(statementLines(src, statement));
    if (!accepted.length) break;
    for (const edit of accepted.sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  }
  return text;
}

/** Lines that still name a removed export in code, comments aside. */
function remainingUses(file: string, text: string): string[] {
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lines = new Set<number>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && RENAMES[node.text]) lines.add(src.getLineAndCharacterOfPosition(node.getStart(src)).line);
    ts.forEachChild(node, visit);
  };
  visit(src);
  const all = text.split('\n');
  return [...lines].map((line) => `  rewrite by hand ${line + 1}: ${all[line].trim()}`);
}

/** Recursively collect .ts files under a root, skipping generated and vendored folders. */
function collect(root: string, out: string[]): void {
  if (!statSync(root).isDirectory()) {
    out.push(root);
    return;
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(full, out);
    } else if (['.ts', '.tsx'].includes(extname(entry.name)) && !entry.name.endsWith('.d.ts')) out.push(full);
  }
}

function main(): void {
  const { positionals } = parseArgs({ allowPositionals: true });
  const [mode, ...roots] = positionals;
  if ((mode !== 'inventory' && mode !== 'rewrite') || roots.length === 0) {
    console.error('Usage: <inventory|rewrite> <roots…>');
    process.exit(1);
  }
  const files: string[] = [];
  for (const root of roots) collect(root, files);
  let rewritten = 0;
  let manual = 0;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    if (!ANY_USE.test(source)) continue;
    const next = rewriteSource(file, source);
    const hand = remainingUses(file, next);
    const changed = next !== source;
    console.info(`${file}${changed ? ` (${mode === 'rewrite' ? 'rewrote' : 'would rewrite'})` : ''}`);
    for (const note of hand) console.info(note);
    manual += hand.length;
    if (changed) {
      rewritten += 1;
      if (mode === 'rewrite') writeFileSync(file, next);
    }
  }
  console.info(`\n${mode === 'rewrite' ? 'Rewrote' : 'Would rewrite'} ${rewritten} file(s); ${manual} line(s) need a hand rewrite, across ${files.length} scanned.`);
}

main();
