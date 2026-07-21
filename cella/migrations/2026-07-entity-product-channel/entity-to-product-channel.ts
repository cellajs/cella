/**
 * Codemod: sharpen loosely-named `entity` identifiers to `product`/`channel`.
 *
 * Several identifiers used the generic word `entity` for something that is really
 * product-only (embeddings, seen/unseen tracking, the product cache, the product-sync
 * notification) or channel-only (membership/permission/ancestor enrichment, channel
 * counts, channel route config). This renames each to make the constraint explicit.
 *
 * This is both the implementation tool (run once against cella) and the fork-migration
 * tool: forks run it against their own code before `cella-cli pull` so both sides carry
 * identical renames and the pull minimizes conflicts.
 *
 * It renames ONLY an explicit old -> new allow-list of whole identifiers (word-boundary
 * matched) plus the kebab stems of renamed files inside import paths. It deliberately does
 * NOT touch the ambiguous generic tokens `entityType`, `entityTypes`, `entityId`,
 * `entityIds`, `entityKey`, the `'entity'` string literal, or the `entity_id`/`entity_type`
 * DB columns, because those are legitimately generic elsewhere (config, CDC table kinds,
 * OpenAPI tags, product_counters). Those field/column/literal renames are per-file and are
 * listed as manual steps in the README.
 *
 * Modes:
 *   inventory - report only (no writes)
 *   rewrite   - apply
 *
 * Usage (repo root):
 *   pnpm exec tsx cella/migrations/2026-07-entity-product-channel/entity-to-product-channel.ts inventory <srcDir ...>
 *   pnpm exec tsx cella/migrations/2026-07-entity-product-channel/entity-to-product-channel.ts rewrite  <srcDir ...>
 *
 * Fork-specific renames go in a JSON object file (`{ "oldName": "newName" }`) passed via
 * `--extra-renames` (merged into the allow-list for the run), never by editing RENAMES
 * below, which would conflict on the next sync:
 *   ... rewrite <srcDir ...> --extra-renames fork-renames.json
 *
 * @see README.md
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Whole-identifier rename map (old -> new). Only globally-unambiguous names live here;
 * ambiguous generic tokens are handled manually (see README).
 */
export const RENAMES: Readonly<Record<string, string>> = {
  // Product embeddings (config + derived)
  entityEmbeddings: 'productEmbeddings',
  embeddedEntity: 'embeddedProduct',
  hostEntity: 'hostProduct',
  EntityEmbedding: 'ProductEmbedding',
  embeddedEntityType: 'embeddedProductType',
  embeddingsByEntity: 'embeddingsByProduct',

  // Seen/unseen tracking (product-only)
  seenTrackedEntityTypes: 'seenTrackedProductTypes',
  SeenTrackedEntityType: 'SeenTrackedProductType',
  markEntitySeen: 'markProductSeen',
  trackedEntityTypes: 'trackedProductTypes',
  trackedEntityTypeSet: 'trackedProductTypeSet',
  isTrackedEntityType: 'isTrackedProductType',

  // Product cache middleware
  appCache: 'productCache',
  entityCache: 'productCache',
  invalidateByEntity: 'invalidateProduct',
  entityCacheData: 'productCacheData',
  entityCacheMetrics: 'productCacheMetrics',

  // Product-sync SSE dispatch
  canReceiveEntityEvent: 'canReceiveProductEvent',

  // CDC product sequence stamps
  allEntityStamps: 'allProductStamps',

  // Channel counts (channel-only)
  getEntityCounts: 'getChannelCounts',
  getEntityCountsSelect: 'getChannelCountsSelect',

  // Channel membership mutation types (channel-only)
  EntityMembershipChannelProp: 'MembershipChannelProp',

  // Channel enrichment + route config (channel-only)
  EntityEnrichment: 'ChannelEntityEnrichment',
  EnrichableEntity: 'EnrichableChannelEntity',
  entityRouteConfig: 'channelEntityRouteConfig',
  EntityRouteEntry: 'ChannelEntityRouteEntry',
  usePageEntityKey: 'usePageChannelEntityKey',
  EntityGridTile: 'ChannelEntityGridTile',
  TileEntity: 'ChannelTileEntity',
  LeaveEntityButton: 'LeaveChannelEntityButton',
  LeaveEntityButtonProps: 'LeaveChannelEntityButtonProps',
  leaveEntity: 'leaveChannelEntity',
};

/** Kebab-case file stems that are renamed on disk; rewritten inside import paths too. */
export const FILE_STEMS: Readonly<Record<string, string>> = {
  // 'entity-cache' also rewrites 'app-entity-cache' and the 'middlewares/entity-cache/' segment
  'app-entity-cache': 'app-product-cache',
  'entity-cache': 'product-cache',
  'use-page-entity-key': 'use-page-channel-entity-key',
  'leave-entity-button': 'leave-channel-entity-button',
};

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.git', 'sdk/gen', '.claude', 'drizzle', '.todos', 'build', 'coverage']);

/** Longest-first word-boundary alternation over the rename keys. */
export function buildRenameRegex(renames: Readonly<Record<string, string>>): RegExp {
  const alternation = Object.keys(renames)
    .sort((a, b) => b.length - a.length)
    .join('|');
  return new RegExp(`\\b(${alternation})\\b`, 'g');
}

const stemAlternation = Object.keys(FILE_STEMS)
  .sort((a, b) => b.length - a.length)
  .join('|');
const STEM_RE = new RegExp(`(${stemAlternation})`, 'g');

export function transform(source: string, renames: Readonly<Record<string, string>> = RENAMES): string {
  const idRe = buildRenameRegex(renames);
  let out = source;
  out = out.replace(STEM_RE, (m) => FILE_STEMS[m] ?? m);
  out = out.replace(idRe, (m) => renames[m] ?? m);
  return out;
}

function shouldSkipDir(path: string): boolean {
  const parts = path.split('/');
  if (parts.some((p) => EXCLUDE_DIRS.has(p))) return true;
  if (path.includes('sdk/gen')) return true;
  return false;
}

function walk(dir: string, files: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (shouldSkipDir(full)) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (CODE_EXT.has(full.slice(full.lastIndexOf('.')))) files.push(full);
  }
}

/** Read `--extra-renames <file>` (a JSON object of old -> new) out of the args. */
function takeExtraRenames(args: string[]): Readonly<Record<string, string>> {
  const flagIndex = args.indexOf('--extra-renames');
  if (flagIndex === -1) return {};
  const extrasPath = args[flagIndex + 1];
  if (!extrasPath) throw new Error('--extra-renames requires a path to a JSON object of old -> new names');
  const parsed: unknown = JSON.parse(readFileSync(extrasPath, 'utf8'));
  const ok =
    parsed !== null &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    Object.entries(parsed).every(([k, v]) => k.length > 0 && typeof v === 'string' && v.length > 0);
  if (!ok) throw new Error(`${extrasPath} must be a JSON object mapping non-empty old -> new identifier strings`);
  args.splice(flagIndex, 2);
  return parsed as Record<string, string>;
}

function main(): void {
  const args = process.argv.slice(2);
  const extraRenames = takeExtraRenames(args);
  const [mode, ...roots] = args;
  if ((mode !== 'inventory' && mode !== 'rewrite') || roots.length === 0) {
    throw new Error('usage: entity-to-product-channel.ts <inventory|rewrite> <srcDir ...> [--extra-renames extras.json]');
  }
  const dry = mode === 'inventory';
  const renames = Object.keys(extraRenames).length ? { ...RENAMES, ...extraRenames } : RENAMES;

  const files: string[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const st = statSync(root);
    if (st.isDirectory()) walk(root, files);
    else if (CODE_EXT.has(root.slice(root.lastIndexOf('.')))) files.push(root);
  }

  const selfPath = fileURLToPath(import.meta.url);
  let changed = 0;
  for (const file of files) {
    if (resolve(file) === selfPath) continue; // never rewrite this codemod (rename-proof)
    const src = readFileSync(file, 'utf8');
    const next = transform(src, renames);
    if (next !== src) {
      changed++;
      if (!dry) writeFileSync(file, next);
      console.info(`${dry ? '[dry] ' : ''}rewrote ${file}`);
    }
  }
  console.info(`\n${changed} file(s) ${dry ? 'would change' : 'changed'} of ${files.length} scanned.`);
}

// Only run when invoked directly (not when imported for its exported helpers/tests).
// Rename-proof: compares this module's URL to the invoked script path, so a fork's
// renamed copy still runs instead of silently exiting 0.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
