/**
 * App migration planner.
 *
 * Computes which cella migrations an app still has to apply and prints them in order, so a
 * human or an agent can work the list. Every `<id>/` folder here is one migration, described by
 * its README.md (frontmatter, title, summary). The source of truth for "already done" is the
 * app's applied-set file ({@link APPLIED_FILE} in the cella/ folder), not version math: pending
 * = every folder whose id is absent from the applied-set. This is stable across release- and
 * branch-tracking apps alike.
 *
 * Usage (from the repo root):
 *   pnpm exec tsx cella/migrations/run.ts            # print the pending plan (human)
 *   pnpm exec tsx cella/migrations/run.ts --json     # same plan as JSON, for an agent
 *   pnpm exec tsx cella/migrations/run.ts --all      # every migration, applied or not
 *   pnpm exec tsx cella/migrations/run.ts status     # one-line applied/pending summary
 *   pnpm exec tsx cella/migrations/run.ts mark <id…> # record migrations as applied
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { noteCodemod, noteIdPattern, parseMigrationNote } from '../../shared/scripts/check-migration-notes.ts'

/** One migration, read from its folder. */
interface Migration {
  /** Folder name and stable id: `<YYYYMMDDThhmm>-<slug>` (UTC, lexically sortable). */
  id: string
  /** The README title. */
  title: string
  /** `codemod` when the folder ships a script, else `manual` (steps in the README). */
  kind: 'codemod' | 'manual'
  /** Changes upstream in a way app-specific code must follow. */
  syncBreaking: boolean
  /** Bumped `clientCacheVersion` or shipped a lens module. */
  clientCacheBump: boolean
  /** Repo-root-relative path to the codemod, or null. */
  script: string | null
  /** Default scan roots for the codemod. */
  roots: string[]
  /** The README's summary paragraph. */
  summary: string
}

/** App-owned record of applied migration ids, in the cella/ folder. */
const APPLIED_FILE = 'cella.migrations.json'

const here = dirname(fileURLToPath(import.meta.url))
const cellaDir = resolve(here, '..')
const repoDir = resolve(cellaDir, '..')
const appliedPath = join(cellaDir, APPLIED_FILE)
// Pre-relocation location (repo root). Read-only fallback so the pending plan stays correct in the
// window between pulling this move and running the migration that git-mv's the file into cella/.
const legacyAppliedPath = join(repoDir, APPLIED_FILE)

/** Every migration folder, sorted by id (timestamp prefix gives chronological order), plus shape warnings. */
function readMigrations(): { migrations: Migration[]; warnings: string[] } {
  const migrations: Migration[] = []
  const warnings: string[] = []
  const folders = readdirSync(here, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && noteIdPattern.test(entry.name))
    .map((entry) => entry.name)
    .sort()
  for (const id of folders) {
    const readme = join(here, id, 'README.md')
    if (!existsSync(readme)) {
      warnings.push(`"${id}" is missing README.md`)
      continue
    }
    const note = parseMigrationNote(readFileSync(readme, 'utf8'))
    for (const error of note.errors) warnings.push(`"${id}" README: ${error}`)
    const codemod = noteCodemod(readdirSync(join(here, id)))
    const { title, syncBreaking, clientCacheBump, roots, summary } = note
    const script = codemod ? `cella/migrations/${id}/${codemod}` : null
    migrations.push({ id, title: title || id, kind: script ? 'codemod' : 'manual', syncBreaking, clientCacheBump, script, roots, summary })
  }
  return { migrations, warnings }
}

/** Whether this checkout is the cella template itself, which never applies its own migrations. */
function isTemplateRepo(): boolean {
  try {
    const origin = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: repoDir, encoding: 'utf8' }).trim()
    return /[/:]cellajs\/cella(\.git)?$/.test(origin)
  } catch {
    return false
  }
}

/**
 * Read the app's applied-set. Without one, the app is a fresh scaffold whose code already holds
 * every migration on disk: record them all, once, so only migrations from later syncs show up.
 */
function readApplied(migrations: Migration[]): Set<string> {
  const path = existsSync(appliedPath) ? appliedPath : legacyAppliedPath
  if (existsSync(path)) {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { applied?: string[] }
    return new Set(parsed.applied ?? [])
  }
  const applied = new Set(migrations.map((m) => m.id))
  if (isTemplateRepo()) return applied
  writeApplied(applied)
  console.info(`No ${APPLIED_FILE} yet: recorded the ${applied.size} migration(s) already in this app as applied.\n`)
  return applied
}

/** Write the applied-set back, sorted and de-duplicated. */
function writeApplied(ids: Set<string>): void {
  const applied = [...ids].sort()
  writeFileSync(appliedPath, `${JSON.stringify({ applied }, null, 2)}\n`)
}

/** Print the pending plan for humans. */
function printPlan(pending: Migration[]): void {
  if (pending.length === 0) {
    console.info('✓ No pending migrations. This app is up to date.')
    return
  }
  console.info(`${pending.length} pending migration(s), in order:\n`)
  for (const [i, m] of pending.entries()) {
    const tags = [m.kind, m.syncBreaking ? 'sync-breaking' : null, m.clientCacheBump ? 'cache-bump' : null]
      .filter(Boolean)
      .join(', ')
    console.info(`${i + 1}. ${m.title}  [${tags}]`)
    console.info(`   id:      ${m.id}`)
    console.info(`   summary: ${m.summary}`)
    if (m.script) console.info(`   codemod: pnpm exec tsx ${m.script} ${m.roots.join(' ')}`)
    console.info(`   readme:  cella/migrations/${m.id}/README.md`)
    console.info('')
  }
  console.info("Work each README's steps, gate on `pnpm check`, then record it:")
  console.info(`  pnpm exec tsx cella/migrations/run.ts mark ${pending.map((m) => m.id).join(' ')}`)
}

function main(): void {
  const argv = process.argv.slice(2)
  const cmd = argv[0]
  const { migrations: all, warnings } = readMigrations()
  const applied = readApplied(all)

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

  for (const w of warnings) console.warn(`! ${w}`)

  const wantAll = argv.includes('--all')
  const pending = wantAll ? all : all.filter((m) => !applied.has(m.id))

  if (cmd === 'status') {
    const open = all.filter((m) => !applied.has(m.id)).length
    console.info(`applied: ${all.length - open}  pending: ${open}  total: ${all.length}`)
    return
  }

  if (argv.includes('--json')) {
    console.info(JSON.stringify({ pending, appliedCount: applied.size, warnings }, null, 2))
    return
  }

  printPlan(pending)
}

main()
