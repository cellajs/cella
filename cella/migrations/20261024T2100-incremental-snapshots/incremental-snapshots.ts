/**
 * Codemod: drizzle-kit 1.0.0-rc.5 stores every migration snapshot after the first as a diff (snapshot format 9), and
 * `drizzle-kit generate` refuses a migrations folder in the older format until `drizzle-kit up` converts it.
 *
 * `drizzle-kit up` refuses a folder in which two snapshots share an id. Side-effect migrations (`*_side_effects`, and
 * older per-producer folders such as `*_cdc_setup`) each held a copy of the previous snapshot, so `rewrite` first
 * deletes every `snapshot.json` whose id an earlier folder already carries, then runs `drizzle-kit up` on the folder.
 * Only snapshots change: every `migration.sql` stays byte for byte, so no database sees a new migration. Running it
 * again on a converted folder changes nothing.
 *
 * Usage (from the repo root):
 *   pnpm exec tsx cella/migrations/<id>/incremental-snapshots.ts inventory backend/drizzle
 *   pnpm exec tsx cella/migrations/<id>/incremental-snapshots.ts rewrite   backend/drizzle
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

type Snapshot = { path: string; id: string; version: string }

/** Snapshots in folder order, the order drizzle-kit reads them in. */
function readSnapshots(root: string): Snapshot[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name, 'snapshot.json'))
    .filter((path) => existsSync(path))
    .sort()
    .map((path) => {
      const { id, version } = JSON.parse(readFileSync(path, 'utf8'))
      return { path, id, version: String(version) }
    })
}

/** Splits snapshots into the first of each id and the later copies. */
function splitCopies(snapshots: Snapshot[]): { kept: Snapshot[]; copies: Snapshot[] } {
  const seen = new Set<string>()
  const kept: Snapshot[] = []
  const copies: Snapshot[] = []
  for (const snapshot of snapshots) {
    if (seen.has(snapshot.id)) copies.push(snapshot)
    else {
      seen.add(snapshot.id)
      kept.push(snapshot)
    }
  }
  return { kept, copies }
}

const [command, root = 'backend/drizzle'] = process.argv.slice(2)
if (command !== 'inventory' && command !== 'rewrite') {
  console.error('Usage: incremental-snapshots.ts <inventory|rewrite> [migrations folder]')
  process.exit(1)
}

const { kept, copies } = splitCopies(readSnapshots(root))
const toConvert = kept.filter((snapshot) => snapshot.version !== '9').length
console.info(`${kept.length + copies.length} snapshots: ${copies.length} copies to delete, ${toConvert} to convert to format 9`)
for (const copy of copies) console.info(`  copy: ${copy.path}`)

if (command === 'rewrite') {
  for (const copy of copies) rmSync(copy.path)
  // The backend package declares drizzle-kit, so its binary resolves there.
  execFileSync('pnpm', ['-C', 'backend', 'exec', 'drizzle-kit', 'up', '--dialect', 'postgresql', '--out', resolve(root)], { stdio: 'inherit' })
}
