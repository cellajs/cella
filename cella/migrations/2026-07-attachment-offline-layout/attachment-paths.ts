/**
 * Codemod: attachment module layout + naming sweep.
 *
 * Upstream moved the attachment module's offline blob pipeline out of the library-named
 * `dexie/` folder into `offline/` (pulling the two root services in with it), renamed the
 * generically-named dialog/table files, and moved `formatBytes` to `~/utils`. It also renamed
 * a few symbols so "sync" once again means only CDC/SSE entity replication.
 *
 * This is both the implementation tool (run once against cella) and the fork-migration tool:
 * forks run it against their own code so both sides carry identical rewrites and the pull
 * minimizes conflicts.
 *
 * It rewrites ONLY an explicit map of import paths and a small allow-list of whole
 * identifiers. It deliberately does NOT touch unrelated `dexie` usage (the `dexie` package
 * itself, `dexie-react-hooks`, `~/query/app-db`), nor unrelated `sync`/`helpers`/`cells`
 * naming elsewhere in the codebase.
 *
 * Modes:
 *   inventory — report only (no writes)
 *   rewrite   — apply
 *
 * Usage (repo root):
 *   pnpm exec tsx cella/migrations/2026-07-attachment-offline-layout/attachment-paths.ts inventory <srcDir ...>
 *   pnpm exec tsx cella/migrations/2026-07-attachment-offline-layout/attachment-paths.ts rewrite  <srcDir ...>
 *
 * Idempotent: running against already-migrated code is a no-op.
 *
 * @see README.md
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Import-path rewrites, applied longest-first so nested paths win over their prefixes. */
export const PATH_REWRITES: ReadonlyArray<readonly [from: string, to: string]> = [
  // The offline blob pipeline: dexie/ (a library name) -> offline/ (what it does).
  ['~/modules/attachment/dexie/', '~/modules/attachment/offline/'],
  // The two background services join their collaborators.
  ['~/modules/attachment/download-service', '~/modules/attachment/offline/download-service'],
  ['~/modules/attachment/upload-service', '~/modules/attachment/offline/upload-service'],
  // Generic file names -> descriptive ones, per sibling-module convention.
  ['~/modules/attachment/dialog/handler', '~/modules/attachment/dialog/attachment-dialog-handler'],
  ['~/modules/attachment/dialog/helpers', '~/modules/attachment/dialog/open-attachment-dialog'],
  ['~/modules/attachment/table/cells', '~/modules/attachment/table/attachment-cells'],
  ['~/modules/attachment/table/helpers', '~/modules/attachment/table/use-attachments-upload-dialog'],
  ['~/modules/attachment/hooks/use-blob-sync-status', '~/modules/attachment/hooks/use-blob-upload-status'],
];

/**
 * Whole-identifier renames. Upload-side vocabulary only: "sync" is reserved for the app-wide
 * CDC/SSE entity replication, so blob pushes are "upload" everywhere.
 */
export const IDENTIFIER_RENAMES: Readonly<Record<string, string>> = {
  syncAttempts: 'uploadAttempts',
  attemptSync: 'processPendingUploads',
  syncOrganizationUploads: 'uploadOrganizationBlobs',
  syncSingleBlob: 'uploadBlob',
};

/**
 * Removed exports: no mechanical replacement, so the codemod only reports them.
 * `pnpm ts` finds every site; see the README table for what to do with each.
 *
 * Generic names are qualified by their receiver — a bare `gc` / `getStatus` / `clearAll` would
 * match unrelated code (`~/query/app-storage`'s own `gc`, for one) and make the report noise.
 */
export const REMOVED_EXPORTS: readonly string[] = [
  'SyncStatusCell',
  'parseBlobKey',
  'hasAnyVariant',
  'markUploading',
  'convertedUrl',
  'attachmentStorage.clearAll',
  'uploadService.getStatus',
  'downloadQueue.gc',
];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const EXTENSIONS = new Set(['.ts', '.tsx']);
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.turbo', 'coverage']);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) yield* walk(path);
    else if (EXTENSIONS.has(path.slice(path.lastIndexOf('.')))) yield path;
  }
}

/** Rewrite one file's contents. Returns null when nothing changed. */
export function rewriteSource(source: string): string | null {
  let next = source;

  for (const [from, to] of [...PATH_REWRITES].sort((a, b) => b[0].length - a[0].length)) {
    next = next.split(from).join(to);
  }

  for (const [from, to] of Object.entries(IDENTIFIER_RENAMES)) {
    next = next.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  }

  return next === source ? null : next;
}

/** Report removed exports still referenced, so the caller can point at them. */
export function findRemovedExports(source: string): string[] {
  return REMOVED_EXPORTS.filter((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`).test(source));
}

function main() {
  const [mode, ...dirs] = process.argv.slice(2);

  if (mode !== 'inventory' && mode !== 'rewrite') {
    console.error('Usage: attachment-paths.ts <inventory|rewrite> <srcDir ...>');
    process.exit(1);
  }
  if (!dirs.length) {
    console.error('At least one source directory is required.');
    process.exit(1);
  }

  let changed = 0;
  const flagged: string[] = [];

  for (const dir of dirs) {
    const root = resolve(dir);
    if (!existsSync(root)) {
      console.error(`Skipping missing directory: ${root}`);
      continue;
    }

    for (const file of walk(root)) {
      const source = readFileSync(file, 'utf8');

      const next = rewriteSource(source);
      if (next) {
        changed++;
        if (mode === 'rewrite') writeFileSync(file, next);
        console.log(`${mode === 'rewrite' ? 'rewrote' : 'would rewrite'}  ${file}`);
      }

      // Report removed exports against the ORIGINAL source: they have no mechanical fix.
      const removed = findRemovedExports(source);
      if (removed.length) flagged.push(`${file}: ${removed.join(', ')}`);
    }
  }

  console.log(`\n${changed} file(s) ${mode === 'rewrite' ? 'rewritten' : 'would be rewritten'}.`);

  if (flagged.length) {
    console.log('\nReferences to removed/renamed exports — review by hand (see README):');
    for (const line of flagged) console.log(`  ${line}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
