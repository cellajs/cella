/**
 * Codemod: drop the redundant `Entity` suffix from single-family channel/product identifiers.
 *
 * Cella has two entity families: channel entities (membership-scoped) and product entities
 * (content). The generic word `entity` stays on genuinely entity-agnostic code and on the
 * type-string unions (`ChannelEntityType`, `productEntityTypes`, `entityType`, …). This sweep
 * only renames identifiers that were constrained to one family and wore a redundant `Entity`:
 * base schemas keep `Base` (`ChannelBase`, `ProductBase`), everything else drops `Entity`
 * (`getValidChannel`, `EnrichedChannel`, `isChannel`-style names, `channelColumns`, …).
 *
 * Whole-identifier allow-list, word-boundary matched: it can never touch `ChannelEntityType` or
 * the ~140 bare `channelEntity` variables (those collide with existing `channel`/`channelId` and
 * are deferred). Longest keys are matched first so nested names (…ButtonProps) are safe.
 *
 * Usage (from the repo root):
 *   pnpm exec tsx cella/migrations/<id>/drop-entity-suffix-renames.ts inventory <roots…>
 *   pnpm exec tsx cella/migrations/<id>/drop-entity-suffix-renames.ts rewrite   <roots…>
 *   pnpm exec tsx cella/migrations/<id>/drop-entity-suffix-renames.ts rewrite   <roots…> --extra-renames fork.json
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'

/** Whole-identifier renames (old -> new), word-boundary matched. */
const RENAMES: Record<string, string> = {
  // Permission subjects carry ancestor channel ids, not a computed authorization scope.
  ChannelScope: 'AncestorChannelIds',
  // Channel base entity: type/schema/mock/select and the channel included schema.
  // Mirrors the product side (ProductBase / productBaseSchema / mockProductBase).
  ChannelEntityBase: 'ChannelBase',
  channelEntityBaseSchema: 'channelBaseSchema',
  channelEntityBaseSelect: 'channelBaseSelect',
  mockChannelEntityBase: 'mockChannelBase',
  channelEntityIncludedSchema: 'channelIncludedSchema',
  // Product base entity: type/schema/mock
  ProductEntityBase: 'ProductBase',
  productEntityBaseSchema: 'productBaseSchema',
  mockProductEntityBase: 'mockProductBase',
  // Fetch-and-authorize helpers and their result types
  getValidChannelEntity: 'getValidChannel',
  getValidProductEntity: 'getValidProduct',
  ValidChannelEntityResult: 'ValidChannelResult',
  ValidProductEntityResult: 'ValidProductResult',
  // Channel enrichment
  EnrichedChannelEntity: 'EnrichedChannel',
  EnrichableChannelEntity: 'EnrichableChannel',
  initChannelEntityEnrichment: 'initChannelEnrichment',
  ChannelEntityEnrichment: 'ChannelEnrichment',
  // Channel route + list-query wiring
  getChannelEntityRoute: 'getChannelRoute',
  channelEntityRouteConfig: 'channelRouteConfig',
  ChannelEntityRouteEntry: 'ChannelRouteEntry',
  getChannelEntityKeys: 'getChannelKeys',
  channelEntityListQueriesByType: 'channelListQueriesByType',
  ChannelEntityListQueryMap: 'ChannelListQueryMap',
  ChannelEntityListQueryFactory: 'ChannelListQueryFactory',
  channelEntityConfigs: 'channelConfigs',
  channelEntityResults: 'channelResults',
  channelEntityData: 'channelData',
  usePageChannelEntityKey: 'usePageChannelKey',
  // UI
  ChannelEntityView: 'ChannelView',
  ProductEntityView: 'ProductView',
  ChannelEntityGridTile: 'ChannelGridTile',
  LeaveChannelEntityButton: 'LeaveChannelButton',
  LeaveChannelEntityButtonProps: 'LeaveChannelButtonProps',
  leaveChannelEntity: 'leaveChannel',
  // Id columns / tables / db side-effects
  ChannelEntityIdColumns: 'ChannelIdColumns',
  ChannelEntityIdOverrides: 'ChannelIdOverrides',
  channelEntityColumns: 'channelColumns',
  productEntityColumns: 'productColumns',
  channelEntityTables: 'channelTables',
  channelEntityTableNames: 'channelTableNames',
  productEntitySet: 'productSet',
  productEntityImmutableColumns: 'productImmutableColumns',
  productEntityImmutabilityFunctionSQL: 'productImmutabilityFunctionSQL',
  noRlsProductEntityNames: 'noRlsProductNames',
  // Instance variables / params, verified collision-free per file (no real `channel`/`channelId`
  // identifier co-occurs; earlier whole-repo counts were the English word in comments). Longest
  // keys match first, so the id/ids/key variants win over bare `channelEntity`.
  channelEntityIds: 'channelIds',
  channelEntityId: 'channelId',
  channelEntityKey: 'channelKey',
  channelEntity: 'channel',
}

/** Kebab file-stem renames applied inside import path strings (old -> new). */
const FILE_STEMS: Record<string, string> = {
  'mock-channel-entity-id-columns': 'mock-channel-id-columns',
  'use-page-channel-entity-key': 'use-page-channel-key',
  'leave-channel-entity-button': 'leave-channel-button',
  'channel-entity-columns': 'channel-columns',
  'product-entity-columns': 'product-columns',
  'channel-entity-included': 'channel-included',
  'channel-entity-route': 'channel-route',
  'get-channel-entity': 'get-valid-channel',
  'get-product-entity': 'get-valid-product',
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.turbo'])
const EXTS = new Set(['.ts', '.tsx'])

/** Escape a string for use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Build one alternation regex, longest keys first, so nested identifiers match whole. */
function buildRegex(keys: string[], wordBoundary: boolean): RegExp {
  const alts = [...keys].sort((a, b) => b.length - a.length).map(escapeRegExp)
  const body = `(${alts.join('|')})`
  return new RegExp(wordBoundary ? `\\b${body}\\b` : body, 'g')
}

/** Recursively collect .ts/.tsx files under a root, skipping generated and vendored dirs. */
function collect(root: string, out: string[]): void {
  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(full, out)
    } else if (EXTS.has(extname(entry.name)) && !entry.name.endsWith('.gen.ts') && !full.includes('/gen/')) {
      out.push(full)
    }
  }
}

function main(): void {
  const [mode, ...rest] = process.argv.slice(2)
  if (mode !== 'inventory' && mode !== 'rewrite') {
    console.error('Usage: <inventory|rewrite> <roots…> [--extra-renames <file>]')
    process.exit(1)
  }

  const extraIdx = rest.indexOf('--extra-renames')
  const roots = (extraIdx === -1 ? rest : rest.slice(0, extraIdx)).filter((a) => !a.startsWith('--'))
  const renames = { ...RENAMES }
  if (extraIdx !== -1) {
    const file = rest[extraIdx + 1]
    Object.assign(renames, JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>)
  }
  if (roots.length === 0) {
    console.error('Pass at least one root directory (e.g. backend/src frontend/src shared cdc/src).')
    process.exit(1)
  }

  const idRegex = buildRegex(Object.keys(renames), true)
  const stemRegex = buildRegex(Object.keys(FILE_STEMS), false)

  const files: string[] = []
  for (const root of roots) {
    if (statSync(root).isDirectory()) collect(root, files)
    else files.push(root)
  }

  const counts: Record<string, number> = {}
  let changedFiles = 0
  for (const file of files) {
    const before = readFileSync(file, 'utf8')
    const after = before
      .replace(idRegex, (m) => {
        counts[m] = (counts[m] ?? 0) + 1
        return renames[m]
      })
      .replace(stemRegex, (m) => FILE_STEMS[m])
    if (after !== before) {
      changedFiles += 1
      if (mode === 'rewrite') writeFileSync(file, after)
    }
  }

  const verb = mode === 'rewrite' ? 'Rewrote' : 'Would rewrite'
  console.info(`${verb} ${changedFiles} file(s) across ${files.length} scanned.`)
  const hits = Object.entries(counts).sort((a, b) => b[1] - a[1])
  for (const [name, n] of hits) console.info(`  ${name} -> ${renames[name]}  (${n})`)
  if (mode === 'inventory') console.info('\nRun with `rewrite` to apply, then `git mv` the files listed in the README.')
}

main()
