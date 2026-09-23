/**
 * Codemod: one word for who acts. `principal` becomes `actor` everywhere the app names the identity
 * behind a request: the supertable and its module, the id brand, the api_keys column and index, the
 * access-token claim, the rate-limit identifier, the insert helpers and the prose around them. The
 * request-time `Actor`, `ActorContext` and `actorGuard` already used the word; the stored row now does too.
 *
 * Whole-identifier renames, word-boundary matched, over .ts/.tsx/.json/.yml files; generated output
 * (`gen/`, `*.gen.*`, `drizzle/`) is skipped and regenerates from the renamed source. Import paths of the
 * renamed module (`#/modules/principals/…`) are covered by the plural and file-stem entries.
 *
 * Usage (from the repo root):
 *   pnpm exec tsx cella/migrations/<id>/principal-to-actor.ts inventory <roots…>
 *   pnpm exec tsx cella/migrations/<id>/principal-to-actor.ts rewrite   <roots…>
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'

/** Whole-identifier renames (old -> new), word-boundary matched. */
const RENAMES: Record<string, string> = {
  // Table, kinds and id brand.
  principalsTable: 'actorsTable',
  principalKinds: 'actorKinds',
  PrincipalKind: 'ActorKind',
  PrincipalId: 'ActorId',
  // The api_keys column, its index and the query option named after it.
  principalId: 'actorId',
  principalIds: 'actorIds',
  principal_id: 'actor_id',
  api_keys_principal_id_idx: 'api_keys_actor_id_idx',
  // The access-token claim beside `sub`.
  principal_kind: 'actor_kind',
  // Insert helpers and the query that lists a service account's keys.
  insertPrincipals: 'insertActors',
  deleteDanglingPrincipals: 'deleteDanglingActors',
  findApiKeysByPrincipal: 'findApiKeysByActor',
  // Tenant quota keys for service accounts and API keys: these count machines, not actors in general.
  principalQuotaKeys: 'machineQuotaKeys',
  // Module folder and file stems (import paths).
  'insert-principals': 'insert-actors',
  'principals-db': 'actors-db',
  // The plain word, in table-name strings, local variables and prose.
  principals: 'actors',
  principal: 'actor',
  Principals: 'Actors',
  Principal: 'Actor',
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.turbo', 'gen', 'drizzle'])
const EXTS = new Set(['.ts', '.tsx', '.json', '.yml', '.yaml'])

/** Escape a string for use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** One alternation regex, longest keys first, so nested identifiers match whole. */
function buildRegex(keys: string[]): RegExp {
  const alts = [...keys].sort((a, b) => b.length - a.length).map(escapeRegExp)
  return new RegExp(`\\b(${alts.join('|')})\\b`, 'g')
}

/** Recursively collect source files under a root, skipping generated and vendored dirs. */
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
    } else if (EXTS.has(extname(entry.name)) && !/\.gen\.[a-z]+$/.test(entry.name) && !full.includes('/gen/')) {
      out.push(full)
    }
  }
}

function main(): void {
  const [mode, ...rest] = process.argv.slice(2)
  if (mode !== 'inventory' && mode !== 'rewrite') {
    console.error('Usage: <inventory|rewrite> <roots…>')
    process.exit(1)
  }
  const roots = rest.filter((a) => !a.startsWith('--'))
  if (roots.length === 0) {
    console.error('Pass at least one root directory (e.g. backend/src backend/tests backend/scripts shared/src frontend/src).')
    process.exit(1)
  }

  const idRegex = buildRegex(Object.keys(RENAMES))
  const files: string[] = []
  for (const root of roots) {
    if (statSync(root).isDirectory()) collect(root, files)
    else files.push(root)
  }

  const counts: Record<string, number> = {}
  let changedFiles = 0
  for (const file of files) {
    const before = readFileSync(file, 'utf8')
    const after = before.replace(idRegex, (m) => {
      counts[m] = (counts[m] ?? 0) + 1
      return RENAMES[m]
    })
    if (after !== before) {
      changedFiles += 1
      if (mode === 'rewrite') writeFileSync(file, after)
      else console.info(`  ${file}`)
    }
  }

  const verb = mode === 'rewrite' ? 'Rewrote' : 'Would rewrite'
  console.info(`${verb} ${changedFiles} file(s) across ${files.length} scanned.`)
  for (const [name, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.info(`  ${name} -> ${RENAMES[name]}  (${n})`)
  }
  if (mode === 'inventory') console.info('\nRun with `rewrite` to apply, then follow the README manual steps.')
}

main()
