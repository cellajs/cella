/**
 * Codemod: the request tenant transactions take `{ tenantId, includeDeleted }` as a third argument.
 *
 * `rewrite` changes a call whose arguments sit on one line and imports that name the removed exports:
 *   tenantReadAs(ctx, id, fn)                   -> tenantRead(ctx, fn, { tenantId: id })
 *   tenantReadAsIncludingDeleted(ctx, id, fn)   -> tenantRead(ctx, fn, { tenantId: id, includeDeleted: true })
 *   tenantReadIncludingDeleted(ctx, fn)         -> tenantRead(ctx, fn, { includeDeleted: true })
 *   tenantContextIncludingDeleted(ctx, fn)      -> tenantContext(ctx, fn, { includeDeleted: true })
 *   tenantReadUnlessInTransaction(ctx, fn)      -> tenantRead(ctx, fn)
 * `inventory` lists those rewrites and every other use of a removed name, which needs a hand rewrite.
 *
 * Usage (from the repo root):
 *   pnpm exec tsx cella/alignments/<id>/tenant-context-options.ts inventory backend/src
 *   pnpm exec tsx cella/alignments/<id>/tenant-context-options.ts rewrite   backend/src backend/tests
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { parseArgs } from 'node:util';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.turbo', 'gen']);

/** Each removed name: the call it becomes, whether it takes a tenant id argument, and the options it adds. */
const RENAMES: Record<string, { to: string; tenantArg: boolean; options: string[] }> = {
  tenantReadAsIncludingDeleted: { to: 'tenantRead', tenantArg: true, options: ['includeDeleted: true'] },
  tenantReadAs: { to: 'tenantRead', tenantArg: true, options: [] },
  tenantReadIncludingDeleted: { to: 'tenantRead', tenantArg: false, options: ['includeDeleted: true'] },
  tenantContextIncludingDeleted: { to: 'tenantContext', tenantArg: false, options: ['includeDeleted: true'] },
  tenantReadUnlessInTransaction: { to: 'tenantRead', tenantArg: false, options: [] },
};
const NAMES = Object.keys(RENAMES).join('|');
const ANY_USE = new RegExp(`\\b(${NAMES})\\b`, 'g');
const IMPORT_LINE = /^import\s*\{([^}]*)\}\s*from\s*'#\/db\/tenant-context';$/;

/** The top-level comma-separated arguments of `text`, or null when brackets do not balance on the line. */
function splitArgs(text: string): string[] | null {
  const args: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char)) depth -= 1;
    else if (char === ',' && depth === 0) {
      args.push(text.slice(start, i).trim());
      start = i + 1;
    }
    if (depth < 0) return null;
  }
  if (depth !== 0) return null;
  const last = text.slice(start).trim();
  if (last) args.push(last);
  return args;
}

/** The end index of the call's closing parenthesis on `line`, opened at `open`, or -1 when it closes on a later line. */
function closingParen(line: string, open: number): number {
  let depth = 0;
  for (let i = open; i < line.length; i += 1) {
    if (line[i] === '(') depth += 1;
    else if (line[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** One line rewritten, or null when a removed name on it needs a hand rewrite. */
function rewriteLine(line: string): string | null {
  const imported = line.match(IMPORT_LINE);
  if (imported) {
    const names = imported[1].split(',').map((name) => name.trim()).filter(Boolean);
    const next = [...new Set(names.map((name) => RENAMES[name]?.to ?? name))].sort((a, b) => a.localeCompare(b));
    return `import { ${next.join(', ')} } from '#/db/tenant-context';`;
  }
  let out = line;
  for (;;) {
    const match = out.match(new RegExp(`\\b(${NAMES})\\(`));
    if (!match || match.index === undefined) return out;
    const rename = RENAMES[match[1]];
    const open = match.index + match[1].length;
    const close = closingParen(out, open);
    if (close < 0) return null;
    const args = splitArgs(out.slice(open + 1, close));
    if (!args) return null;
    const [ctx, ...rest] = args;
    const tenantId = rename.tenantArg ? rest.shift() : undefined;
    const [fn, extra] = rest;
    if (!fn || extra) return null;
    const options = [...(tenantId ? [tenantId === 'tenantId' ? 'tenantId' : `tenantId: ${tenantId}`] : []), ...rename.options];
    const call = `${rename.to}(${[ctx, fn, ...(options.length ? [`{ ${options.join(', ')} }`] : [])].join(', ')})`;
    out = out.slice(0, match.index) + call + out.slice(close + 1);
  }
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
    ANY_USE.lastIndex = 0;
    const lines = source.split('\n');
    const notes: string[] = [];
    const next = lines.map((line, i) => {
      if (!new RegExp(`\\b(${NAMES})\\b`).test(line)) return line;
      const changed = rewriteLine(line);
      if (changed === null || new RegExp(`\\b(${NAMES})\\b`).test(changed)) {
        notes.push(`  rewrite by hand ${i + 1}: ${line.trim()}`);
        manual += 1;
        return line;
      }
      notes.push(`  ${mode === 'rewrite' ? 'rewrote' : 'would rewrite'} ${i + 1}: ${changed.trim()}`);
      return changed;
    });
    console.info(file);
    for (const note of notes) console.info(note);
    if (next.join('\n') !== source) {
      rewritten += 1;
      if (mode === 'rewrite') writeFileSync(file, next.join('\n'));
    }
  }
  console.info(`\n${mode === 'rewrite' ? 'Rewrote' : 'Would rewrite'} ${rewritten} file(s); ${manual} line(s) need a hand rewrite, across ${files.length} scanned.`);
}

main();
