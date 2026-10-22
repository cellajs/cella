/**
 * Codemod: the template's module constants moved from SCREAMING_CASE to camelCase (`COALESCED` -> `coalescedResult`,
 * `PANEL_MIN_WIDTH` -> `panelMinWidth`).
 *
 * `renames.json` maps each template module that exports a renamed constant (repo-relative path) to its old -> new
 * names. A file is rewritten only where it imports one of those names from that module: static and `await import()`
 * imports, `export { … } from` re-exports, and the object keys of a `vi.mock()` of that module. The import specifier
 * and every identifier reference in the file follow; an aliased import (`OLD as local`) only renames the imported
 * name, and a shorthand property `{ OLD }` becomes `{ OLD: new }` so the key stays. App constants with the same name
 * that are not imported from the template are never touched.
 *
 * Usage (from the repo root):
 *   pnpm exec tsx cella/migrations/<id>/rename-constants.ts inventory <roots…>
 *   pnpm exec tsx cella/migrations/<id>/rename-constants.ts rewrite   <roots…>
 *   pnpm exec tsx cella/migrations/<id>/rename-constants.ts rewrite   <roots…> --extra-renames app-renames.json
 *
 * `--extra-renames` takes a file of the same shape as `renames.json` (module path -> { old: new }) and merges it in,
 * for an app that renames its own exported constants the same way.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, normalize, relative } from 'node:path'
import ts from 'typescript'

type RenameMap = Record<string, Record<string, string>>
type Edit = { start: number; end: number; text: string }

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.turbo', 'gen', 'drizzle'])
const EXTS = new Set(['.ts', '.tsx', '.mts'])

/** A module path without its extension or trailing `/index`, so `#/mocks` and `backend/src/mocks/index.ts` compare equal. */
const moduleKey = (path: string) =>
  normalize(path)
    .replace(/\.(tsx?|mts|js)$/, '')
    .replace(/\/index$/, '')

/** The repo-relative module an import specifier points at, or null for a package outside the template's aliases. */
function resolveSpecifier(specifier: string, file: string, root: string): string | null {
  if (specifier.startsWith('~/')) return moduleKey(`frontend/src/${specifier.slice(2)}`)
  if (specifier.startsWith('#/')) return moduleKey(`backend/src/${specifier.slice(2)}`)
  if (specifier === 'shared') return 'shared'
  if (specifier.startsWith('shared/')) return moduleKey(`shared/src/${specifier.slice('shared/'.length)}`)
  if (specifier.startsWith('.')) return moduleKey(relative(root, join(dirname(file), specifier)))
  return null
}

/** Recursively collect source files under a root, skipping generated and vendored dirs. */
function collect(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(full, out)
    } else if (EXTS.has(extname(entry.name)) && !entry.name.endsWith('.d.ts') && !/\.gen\.[a-z]+$/.test(entry.name)) out.push(full)
  }
}

/** The module a call to one of `callees` names in its first argument, or null; `import` matches `import('…')`. */
function calledModule(node: ts.Node, callees: string[]): string | null {
  if (!ts.isCallExpression(node)) return null
  const callee = node.expression.kind === ts.SyntaxKind.ImportKeyword ? 'import' : node.expression.getText()
  if (!callees.includes(callee)) return null
  const [first] = node.arguments
  return first && ts.isStringLiteral(first) ? first.text : null
}

/** A property-name position: `x.NAME`, `{ NAME: … }`, a type member or a JSX attribute, which never refers to the import. */
function isPropertyName(node: ts.Identifier): boolean {
  const parent = node.parent
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true
  if ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isPropertyDeclaration(parent) || ts.isMethodDeclaration(parent)) && parent.name === node) return true
  if (ts.isJsxAttribute(parent) || (ts.isQualifiedName(parent) && parent.right === node)) return true
  if (ts.isBindingElement(parent) && parent.propertyName === node) return true
  return false
}

function rewrite(file: string, text: string, renames: Map<string, Record<string, string>>, root: string, counts: Record<string, number>): string {
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const edits: Edit[] = []
  const locals = new Map<string, string>()
  const rename = (node: ts.Node, to: string) => edits.push({ start: node.getStart(src), end: node.getEnd(), text: to })
  const mapFor = (specifier: string) => {
    const key = resolveSpecifier(specifier, file, root)
    return key ? renames.get(key) : undefined
  }

  // Imports and re-exports name the module; the local binding follows when it is not aliased.
  const visitSpecifiers = (elements: readonly (ts.ImportSpecifier | ts.ExportSpecifier)[], map: Record<string, string>) => {
    for (const element of elements) {
      const imported = element.propertyName ?? element.name
      const to = ts.isIdentifier(imported) ? map[imported.text] : undefined
      if (!to || !ts.isIdentifier(imported)) continue
      counts[imported.text] = (counts[imported.text] ?? 0) + 1
      rename(imported, to)
      if (!element.propertyName && ts.isImportSpecifier(element)) locals.set(imported.text, to)
    }
  }
  for (const statement of src.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const map = mapFor(statement.moduleSpecifier.text)
      const bindings = statement.importClause?.namedBindings
      if (map && bindings && ts.isNamedImports(bindings)) visitSpecifiers(bindings.elements, map)
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      const map = mapFor(statement.moduleSpecifier.text)
      if (map && statement.exportClause && ts.isNamedExports(statement.exportClause)) visitSpecifiers(statement.exportClause.elements, map)
    }
  }

  const visit = (node: ts.Node) => {
    // `const { OLD } = await import('…')` and `vi.importActual('…')`
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer) {
      const call = ts.isAwaitExpression(node.initializer) ? node.initializer.expression : node.initializer
      const specifier = calledModule(call, ['import', 'vi.importActual'])
      const map = specifier ? mapFor(specifier) : undefined
      if (map) {
        for (const element of node.name.elements) {
          const imported = element.propertyName ?? element.name
          if (!ts.isIdentifier(imported) || !map[imported.text]) continue
          counts[imported.text] = (counts[imported.text] ?? 0) + 1
          rename(imported, map[imported.text])
          if (!element.propertyName) locals.set(imported.text, map[imported.text])
        }
      }
    }
    // `vi.mock('…', () => ({ OLD: … }))`: the mocked module's keys
    const mocked = calledModule(node, ['vi.mock', 'vi.doMock'])
    const mockMap = mocked ? mapFor(mocked) : undefined
    if (mockMap && ts.isCallExpression(node) && node.arguments[1]) {
      const visitKeys = (inner: ts.Node) => {
        if (ts.isPropertyAssignment(inner) && ts.isIdentifier(inner.name) && mockMap[inner.name.text]) {
          counts[inner.name.text] = (counts[inner.name.text] ?? 0) + 1
          rename(inner.name, mockMap[inner.name.text])
        }
        ts.forEachChild(inner, visitKeys)
      }
      visitKeys(node.arguments[1])
    }
    ts.forEachChild(node, visit)
  }
  visit(src)

  // Every reference to an unaliased imported name
  const claimed = new Set(edits.map((edit) => edit.start))
  const references = (node: ts.Node) => {
    if (ts.isIdentifier(node) && locals.has(node.text) && !claimed.has(node.getStart(src)) && !isPropertyName(node)) {
      const to = locals.get(node.text) as string
      if (ts.isShorthandPropertyAssignment(node.parent)) rename(node, `${node.text}: ${to}`)
      else rename(node, to)
    }
    ts.forEachChild(node, references)
  }
  if (locals.size) references(src)

  let out = text
  for (const edit of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  return out
}

function main(): void {
  const [mode, ...rest] = process.argv.slice(2)
  if (mode !== 'inventory' && mode !== 'rewrite') {
    console.error('Usage: <inventory|rewrite> <roots…> [--extra-renames <file>]')
    process.exit(1)
  }
  const extraIdx = rest.indexOf('--extra-renames')
  const roots = (extraIdx === -1 ? rest : rest.slice(0, extraIdx)).filter((arg) => !arg.startsWith('--'))
  if (roots.length === 0) {
    console.error('Pass at least one root directory (e.g. backend/src frontend/src shared/src bench/src).')
    process.exit(1)
  }

  const shipped: RenameMap = JSON.parse(readFileSync(join(import.meta.dirname, 'renames.json'), 'utf8'))
  const extra: RenameMap = extraIdx === -1 ? {} : JSON.parse(readFileSync(rest[extraIdx + 1], 'utf8'))
  const renames = new Map<string, Record<string, string>>()
  for (const [module, map] of [...Object.entries(shipped), ...Object.entries(extra)]) {
    renames.set(moduleKey(module), { ...renames.get(moduleKey(module)), ...map })
  }

  const repoRoot = process.cwd()
  const files: string[] = []
  for (const root of roots) {
    if (!existsSync(root)) continue
    if (statSync(root).isDirectory()) collect(root, files)
    else files.push(root)
  }

  const counts: Record<string, number> = {}
  let changed = 0
  for (const file of files) {
    const before = readFileSync(file, 'utf8')
    const after = rewrite(file, before, renames, repoRoot, counts)
    if (after === before) continue
    changed += 1
    if (mode === 'rewrite') writeFileSync(file, after)
    else console.info(`  ${file}`)
  }

  const verb = mode === 'rewrite' ? 'Rewrote' : 'Would rewrite'
  console.info(`${verb} ${changed} file(s) across ${files.length} scanned.`)
  const names = new Map(Object.values(Object.fromEntries(renames)).flatMap((map) => Object.entries(map)))
  for (const [name, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.info(`  ${name} -> ${names.get(name)}  (${n})`)
  if (mode === 'inventory') console.info('\nRun with `rewrite` to apply, then `pnpm check`.')
}

main()
