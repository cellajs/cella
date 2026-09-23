/**
 * Codemod: the third naming pass over the auth substrate (AUTH_RENAMES_PLAN.md).
 *
 * Whole-identifier renames, word-boundary matched: the engine's missing-ancestor error and its code,
 * the tenant restriction that gates consent to unregistered OAuth clients and its refusal code, and the
 * MCP public URL variable. Scans .ts/.tsx (source), .json (locales, config) and .yml (deploy env) files;
 * generated output (`gen/`, `*.gen.*`, `drizzle/`) is skipped and regenerates from the renamed source.
 *
 * Usage (from the repo root):
 *   pnpm exec tsx cella/migrations/<id>/auth-renames-3.ts inventory <roots…>
 *   pnpm exec tsx cella/migrations/<id>/auth-renames-3.ts rewrite   <roots…>
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'

/** Whole-identifier renames (old -> new), word-boundary matched. */
const RENAMES: Record<string, string> = {
  // The engine raises it when an ancestor channel id is absent; nothing to do with RFC 6750 insufficient_scope.
  MissingScopeError: 'MissingAncestorError',
  missing_scope: 'missing_ancestor',
  'missing-scope-error': 'missing-ancestor-error',
  // The restriction gates consent to clients with no oauth_clients row (Client ID Metadata Document clients).
  allowConsentedClients: 'allowUnregisteredClients',
  clients_not_allowed: 'unregistered_clients_not_allowed',
  // The only public URL variable that carried _API_; the config key was already mcpUrl.
  MCP_API_URL: 'MCP_URL',
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
    console.error('Pass at least one root directory (e.g. backend/src shared/src frontend/src yjs/src locales infra/config).')
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
