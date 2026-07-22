/**
 * Fork migration planner.
 *
 * Computes which cella migrations a fork still has to apply and prints them in order, so a
 * human or an agent can work the list. The source of truth for "already done" is the fork's
 * applied-set file ({@link APPLIED_FILE} at the repo root), not version math: pending =
 * every migration in `manifest.json` whose id is absent from the applied-set. This is stable
 * across release- and branch-tracking forks alike.
 *
 * Usage (from the repo root):
 *   pnpm exec tsx cella/migrations/run.ts            # print the pending plan (human)
 *   pnpm exec tsx cella/migrations/run.ts --json     # same plan as JSON, for an agent
 *   pnpm exec tsx cella/migrations/run.ts --all      # every migration, applied or not
 *   pnpm exec tsx cella/migrations/run.ts status     # one-line applied/pending summary
 *   pnpm exec tsx cella/migrations/run.ts mark <id…> # record migrations as applied
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** One migration as declared in `manifest.json`. */
interface MigrationEntry {
  /** Folder name and stable id: `<YYYYMMDDThhmm>-<slug>` (UTC, lexically sortable). */
  id: string
  /** Cella release the change first ships in, or `"next"` until a release is cut. */
  version: string
  /** Human title. */
  title: string
  /** How the change is applied. */
  kind: 'codemod' | 'sql' | 'manual' | 'mixed'
  /** Changes upstream in a way fork-specific code must follow. */
  forkBreaking: boolean
  /** Bumped `clientCacheVersion` or shipped a lens module. */
  clientCacheBump: boolean
  /** Repo-root-relative path to the codemod, or null. */
  script: string | null
  /** Default scan roots for the codemod. */
  roots: string[]
  /** Follow-up commands the migration needs (e.g. `pnpm generate`). */
  requires: string[]
  /** One-line summary. */
  summary: string
}

interface Manifest {
  schemaVersion: number
  migrations: MigrationEntry[]
}

/** Fork-owned record of applied migration ids, at the repo root. */
const APPLIED_FILE = 'cella.migrations.json'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
const manifestPath = join(here, 'manifest.json')
const appliedPath = join(repoRoot, APPLIED_FILE)

/** Read and lightly validate `manifest.json`. */
function readManifest(): Manifest {
  const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
  if (!Array.isArray(parsed.migrations)) throw new Error('manifest.json: `migrations` must be an array')
  return parsed
}

/** Read the fork's applied-set; empty when the file is absent. */
function readApplied(): Set<string> {
  if (!existsSync(appliedPath)) return new Set()
  const parsed = JSON.parse(readFileSync(appliedPath, 'utf8')) as { applied?: string[] }
  return new Set(parsed.applied ?? [])
}

/** Write the applied-set back, sorted and de-duplicated. */
function writeApplied(ids: Set<string>): void {
  const applied = [...ids].sort()
  writeFileSync(appliedPath, `${JSON.stringify({ applied }, null, 2)}\n`)
}

/** Migrations sorted by id (timestamp prefix gives chronological order). */
function ordered(manifest: Manifest): MigrationEntry[] {
  return [...manifest.migrations].sort((a, b) => a.id.localeCompare(b.id))
}

/** Warn about drift between manifest entries and on-disk folders. */
function driftWarnings(manifest: Manifest): string[] {
  const warnings: string[] = []
  const folders = readdirSync(here, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
  const declared = new Set(manifest.migrations.map((m) => m.id))
  for (const m of manifest.migrations) {
    if (!folders.includes(m.id)) warnings.push(`manifest entry "${m.id}" has no folder`)
    else if (!existsSync(join(here, m.id, 'README.md'))) warnings.push(`"${m.id}" is missing README.md`)
  }
  for (const f of folders) {
    if (!declared.has(f)) warnings.push(`folder "${f}" is not in manifest.json`)
  }
  return warnings
}

/** Print the pending plan for humans. */
function printPlan(pending: MigrationEntry[]): void {
  if (pending.length === 0) {
    console.info('✓ No pending migrations. This fork is up to date.')
    return
  }
  console.info(`${pending.length} pending migration(s), in order:\n`)
  for (const [i, m] of pending.entries()) {
    const tags = [m.kind, m.forkBreaking ? 'fork-breaking' : null, m.clientCacheBump ? 'cache-bump' : null]
      .filter(Boolean)
      .join(', ')
    console.info(`${i + 1}. ${m.title}  [${tags}]`)
    console.info(`   id:      ${m.id}  (ships in ${m.version})`)
    console.info(`   summary: ${m.summary}`)
    if (m.script) console.info(`   codemod: pnpm exec tsx ${m.script} ${m.roots.join(' ')}`)
    if (m.requires.length) console.info(`   then:    ${m.requires.join(', ')}`)
    console.info(`   readme:  cella/migrations/${m.id}/README.md`)
    console.info('')
  }
  console.info('After applying each, gate on `pnpm check`, then record it:')
  console.info(`  pnpm exec tsx cella/migrations/run.ts mark ${pending.map((m) => m.id).join(' ')}`)
}

function main(): void {
  const argv = process.argv.slice(2)
  const cmd = argv[0]
  const manifest = readManifest()
  const applied = readApplied()
  const all = ordered(manifest)

  if (cmd === 'mark') {
    const ids = argv.slice(1)
    if (ids.length === 0) throw new Error('mark: pass one or more migration ids')
    const declared = new Set(all.map((m) => m.id))
    const unknown = ids.filter((id) => !declared.has(id))
    if (unknown.length) throw new Error(`mark: unknown migration id(s): ${unknown.join(', ')}`)
    for (const id of ids) applied.add(id)
    writeApplied(applied)
    console.info(`Recorded ${ids.length} migration(s) as applied in ${APPLIED_FILE}.`)
    return
  }

  const warnings = driftWarnings(manifest)
  for (const w of warnings) console.warn(`! ${w}`)

  const wantAll = argv.includes('--all')
  const pending = wantAll ? all : all.filter((m) => !applied.has(m.id))

  if (cmd === 'status') {
    console.info(`applied: ${applied.size}  pending: ${all.length - applied.size}  total: ${all.length}`)
    return
  }

  if (argv.includes('--json')) {
    console.info(JSON.stringify({ pending, appliedCount: applied.size, warnings }, null, 2))
    return
  }

  printPlan(pending)
}

main()
