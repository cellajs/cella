/**
 * Codemod: app compositions leave the ui kit. `SubmitButton`, `ComboboxSelect` (with `ComboboxSelectProps` and
 * `ComboBoxOption`), `ComboboxSearchInput` and `ResponsiveSelect` move from `~/modules/ui/*` to `~/modules/common/*`,
 * so every file in `frontend/src/modules/ui` maps to one upstream shadcn component.
 *
 * Rewrites named imports: a moved specifier leaves its old `import { … } from` declaration (which is dropped when it
 * empties) and joins a declaration for the new module, keeping `type` modifiers and `as` aliases. Run
 * `pnpm lint:fix` afterwards so Biome sorts the touched imports.
 *
 * Usage (from the repo root):
 *   pnpm exec tsx cella/migrations/<id>/move-ui-compositions.ts inventory frontend/src
 *   pnpm exec tsx cella/migrations/<id>/move-ui-compositions.ts rewrite   frontend/src
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'

/** Named export -> [old module, new module]. */
const MOVES: Record<string, [string, string]> = {
  SubmitButton: ['~/modules/ui/button', '~/modules/common/form-fields/submit-button'],
  ComboboxSelect: ['~/modules/ui/combobox', '~/modules/common/form-fields/select-combobox/combobox-select'],
  ComboboxSelectProps: ['~/modules/ui/combobox', '~/modules/common/form-fields/select-combobox/combobox-select'],
  ComboBoxOption: ['~/modules/ui/combobox', '~/modules/common/form-fields/select-combobox/combobox-select'],
  ComboboxSearchInput: ['~/modules/ui/combobox', '~/modules/common/combobox-search-input'],
  ResponsiveSelect: ['~/modules/ui/responsive-select', '~/modules/common/form-fields/responsive-select'],
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.turbo', 'gen'])
const EXTS = new Set(['.ts', '.tsx'])
const IMPORT_RE = /^import\s+(type\s+)?\{([^}]*)\}\s+from\s+'([^']+)';?[ \t]*$/gm

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
    } else if (EXTS.has(extname(entry.name))) out.push(full)
  }
}

/** The exported name a specifier refers to: `type Foo as Bar` -> `Foo`. */
function importedName(specifier: string): string {
  return specifier.replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim()
}

/** Rewrites one file's imports; returns the new text and the moved names. */
function rewrite(source: string): { text: string; moved: string[] } {
  const moved: string[] = []
  const additions = new Map<string, string[]>()
  let text = source.replace(IMPORT_RE, (full, typeOnly: string | undefined, list: string, from: string) => {
    const specifiers = list.split(',').map((s) => s.trim()).filter(Boolean)
    const keep: string[] = []
    for (const spec of specifiers) {
      const move = MOVES[importedName(spec)]
      if (move && move[0] === from) {
        moved.push(importedName(spec))
        const target = additions.get(move[1]) ?? []
        target.push(typeOnly && !spec.startsWith('type ') ? `type ${spec}` : spec)
        additions.set(move[1], target)
      } else keep.push(spec)
    }
    if (keep.length === specifiers.length) return full
    const added = [...additions.entries()].map(([to, specs]) => `import { ${specs.join(', ')} } from '${to}';`)
    additions.clear()
    const kept = keep.length ? `import ${typeOnly ?? ''}{ ${keep.join(', ')} } from '${from}';` : ''
    return [kept, ...added].filter(Boolean).join('\n')
  })
  // Merge a moved import into an existing declaration for the same new module.
  for (const to of new Set(Object.values(MOVES).map(([, t]) => t))) {
    const decls = [...text.matchAll(new RegExp(`^import \\{([^}]*)\\} from '${to.replace(/[/.-]/g, '\\$&')}';\\n?`, 'gm'))]
    if (decls.length < 2) continue
    const specs = [...new Set(decls.flatMap((d) => d[1].split(',').map((s) => s.trim()).filter(Boolean)))]
    text = text.replace(decls[0][0], `import { ${specs.join(', ')} } from '${to}';\n`)
    for (const d of decls.slice(1)) text = text.replace(d[0], '')
  }
  return { text, moved }
}

function main(): void {
  const [mode, ...rest] = process.argv.slice(2)
  if (mode !== 'inventory' && mode !== 'rewrite') {
    console.error('Usage: <inventory|rewrite> <roots…>')
    process.exit(1)
  }
  const roots = rest.filter((a) => !a.startsWith('--'))
  if (roots.length === 0) {
    console.error('Pass at least one root directory (e.g. frontend/src).')
    process.exit(1)
  }

  const files: string[] = []
  for (const root of roots) {
    if (statSync(root).isDirectory()) collect(root, files)
    else files.push(root)
  }

  const counts: Record<string, number> = {}
  let changedFiles = 0
  for (const file of files) {
    const before = readFileSync(file, 'utf8')
    const { text, moved } = rewrite(before)
    if (text === before) continue
    changedFiles += 1
    for (const name of moved) counts[name] = (counts[name] ?? 0) + 1
    if (mode === 'rewrite') writeFileSync(file, text)
    else console.info(`  ${file}`)
  }

  const verb = mode === 'rewrite' ? 'Rewrote' : 'Would rewrite'
  console.info(`${verb} ${changedFiles} file(s) across ${files.length} scanned.`)
  for (const [name, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.info(`  ${name}: ${MOVES[name][0]} -> ${MOVES[name][1]}  (${n})`)
  }
  if (mode === 'inventory') console.info('\nRun with `rewrite` to apply, then `pnpm lint:fix`.')
}

main()
