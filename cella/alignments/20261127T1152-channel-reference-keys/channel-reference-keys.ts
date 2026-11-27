/**
 * Codemod: `channelRelationIndexes` is `channelRelationConstraints`, which also returns the composite tenant key of each
 * ancestor column, and takes a channel below the organization as well as a product.
 *
 * `rewrite` renames the identifier in every .ts file:
 *   channelRelationIndexes                  -> channelRelationConstraints
 * `inventory` lists the renames and what needs judgment, which no mode rewrites. In a channel table file (one that
 * spreads `channelColumns(`):
 *   .references(() => <parent>sTable.id …)  -> gone on an ancestor column: the spread keys it with the tenant
 *   index('<table>_<channel>_id_index')     -> gone on an ancestor column: the spread declares the same index
 *
 * Usage (from the repo root):
 *   pnpm exec tsx cella/alignments/<id>/channel-reference-keys.ts inventory backend/src
 *   pnpm exec tsx cella/alignments/<id>/channel-reference-keys.ts rewrite   backend/src
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', 'gen']);

const OLD_NAME = /\bchannelRelationIndexes\b/g;
const CHANNEL_TABLE = /\.\.\.channelColumns\(/;
const REFERENCE = /\.references\(\(\) => \w+\.id\b/;
const ANCESTOR_INDEX = /index\('\w+_id_index'\)/;
const OWN_INDEX = /_(?:tenant|organization)_id_index'/;

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
    } else if (extname(entry.name) === '.ts' && !entry.name.endsWith('.d.ts')) out.push(full);
  }
}

/** Lines of a channel table file that need judgment, as `line: what`. */
function judgments(source: string): string[] {
  if (!CHANNEL_TABLE.test(source)) return [];
  return source.split('\n').flatMap((line, index) => {
    const ancestorIndex = ANCESTOR_INDEX.test(line) && !OWN_INDEX.test(line);
    return REFERENCE.test(line) || ancestorIndex ? [`${index + 1}: drop on an ancestor column: ${line.trim()}`] : [];
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
  let rewritten = 0;
  let judged = 0;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const renames = source.match(OLD_NAME)?.length ?? 0;
    const open = judgments(source);
    if (renames === 0 && open.length === 0) continue;
    console.info(file);
    if (renames > 0) console.info(`  ${mode === 'rewrite' ? 'rewrote' : 'would rewrite'} ${renames} x channelRelationIndexes -> channelRelationConstraints`);
    for (const line of open) console.info(`  judge ${line}`);
    if (renames > 0) rewritten += 1;
    judged += open.length;
    if (mode === 'rewrite' && renames > 0) writeFileSync(file, source.replace(OLD_NAME, 'channelRelationConstraints'));
  }
  console.info(`\n${mode === 'rewrite' ? 'Rewrote' : 'Would rewrite'} ${rewritten} file(s); ${judged} line(s) need judgment, across ${files.length} scanned.`);
}

main();
