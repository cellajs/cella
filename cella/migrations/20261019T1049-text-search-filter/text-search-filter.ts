/**
 * Codemod: `prepareStringForILikeFilter` is removed; text search filters use `textSearchFilter(column, q)`.
 *
 * - `ilike(column, prepareStringForILikeFilter(q))` becomes `textSearchFilter(column, q)`.
 * - `const token = prepareStringForILikeFilter(q)` whose every use is `ilike(column, token)` is inlined the same way and
 *   the declaration removed.
 * - A trailing `.trim()` on the query is dropped: `textSearchFilter` trims.
 * - The `#/utils/sql` import is renamed; `ilike` leaves the drizzle-orm import when nothing else uses it.
 * - Any other use is reported for a manual edit and the file keeps its import.
 *
 * Usage (from the repo root):
 *   pnpm exec tsx cella/migrations/<id>/text-search-filter.ts inventory backend/src
 *   pnpm exec tsx cella/migrations/<id>/text-search-filter.ts rewrite   backend/src
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import ts from 'typescript'

const OLD = 'prepareStringForILikeFilter'
const NEW = 'textSearchFilter'
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.turbo', 'gen'])

/** Recursively collect .ts files under a root, skipping generated and vendored dirs. */
function collect(root: string, out: string[]): void {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(full, out)
    } else if (extname(entry.name) === '.ts' && !entry.name.endsWith('.d.ts')) out.push(full)
  }
}

type Edit = { start: number; end: number; text: string }
type Report = { rewritten: number; manual: string[] }

const isCallTo = (node: ts.Node, name: string): node is ts.CallExpression =>
  ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name

/** The query text without a trailing `.trim()`. */
function queryText(arg: ts.Expression, src: ts.SourceFile): string {
  if (ts.isCallExpression(arg) && arg.arguments.length === 0 && ts.isPropertyAccessExpression(arg.expression) && arg.expression.name.text === 'trim') {
    return arg.expression.expression.getText(src)
  }
  return arg.getText(src)
}

/** The ilike call whose second argument is `node`, or null. */
function enclosingIlike(node: ts.Node): ts.CallExpression | null {
  const parent = node.parent
  return parent && isCallTo(parent, 'ilike') && parent.arguments.length === 2 && parent.arguments[1] === node ? parent : null
}

/** Whole lines of a statement, so removing it leaves no blank line behind. */
function statementLines(statement: ts.Statement, text: string): Edit {
  let start = statement.getStart()
  while (start > 0 && (text[start - 1] === ' ' || text[start - 1] === '\t')) start--
  let end = statement.getEnd()
  if (text[end] === '\n') end++
  return { start, end, text: '' }
}

/** Identifiers named `name` in `scope` after `after`, excluding the declaration's own name. */
function referencesAfter(scope: ts.Node, name: string, after: number, declarationName: ts.Node): ts.Identifier[] {
  const found: ts.Identifier[] = []
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && node.text === name && node !== declarationName && node.getStart() > after) found.push(node)
    ts.forEachChild(node, visit)
  }
  visit(scope)
  return found
}

function rewriteCalls(file: string, text: string, report: Report): { text: string; complete: boolean } {
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const edits: Edit[] = []
  let complete = true
  const line = (node: ts.Node) => `${file}:${src.getLineAndCharacterOfPosition(node.getStart()).line + 1}`

  const visit = (node: ts.Node) => {
    if (isCallTo(node, OLD) && node.arguments.length === 1) {
      const query = queryText(node.arguments[0], src)
      const ilikeCall = enclosingIlike(node)
      const declaration = ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name) ? node.parent : null
      const statement = declaration?.parent.parent

      if (ilikeCall) {
        edits.push({ start: ilikeCall.getStart(), end: ilikeCall.getEnd(), text: `${NEW}(${ilikeCall.arguments[0].getText(src)}, ${query})` })
        report.rewritten++
      } else if (declaration && statement && ts.isVariableStatement(statement) && declaration.parent.declarations.length === 1) {
        const name = (declaration.name as ts.Identifier).text
        const uses = referencesAfter(statement.parent, name, declaration.getEnd(), declaration.name)
        const ilikeUses = uses.map(enclosingIlike)
        if (uses.length > 0 && ilikeUses.every((call) => call !== null)) {
          for (const call of ilikeUses as ts.CallExpression[]) {
            edits.push({ start: call.getStart(), end: call.getEnd(), text: `${NEW}(${call.arguments[0].getText(src)}, ${query})` })
          }
          edits.push(statementLines(statement, text))
          report.rewritten += uses.length
        } else {
          complete = false
          report.manual.push(line(node))
        }
      } else {
        complete = false
        report.manual.push(line(node))
      }
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(src)

  let out = text
  for (const edit of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  return { text: out, complete }
}

/** Renames the helper import and drops an `ilike` import nothing uses any more. */
function rewriteImports(file: string, text: string): string {
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const edits: Edit[] = []
  const ilikeUsed = (() => {
    let used = false
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node) && node.text === 'ilike' && !ts.isImportSpecifier(node.parent)) used = true
      ts.forEachChild(node, visit)
    }
    visit(src)
    return used
  })()

  for (const statement of src.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const bindings = statement.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    const module = statement.moduleSpecifier.text
    const names = bindings.elements.map((element) => element.getText(src))

    let next = names
    if (module.endsWith('utils/sql') && names.includes(OLD)) {
      next = names.includes(NEW) ? names.filter((name) => name !== OLD) : names.map((name) => (name === OLD ? NEW : name))
    }
    if (module === 'drizzle-orm' && !ilikeUsed) next = next.filter((name) => name !== 'ilike')
    if (next.join() === names.join()) continue

    if (!next.length) edits.push(statementLines(statement, text))
    else edits.push({ start: bindings.getStart(), end: bindings.getEnd(), text: `{ ${next.join(', ')} }` })
  }

  let out = text
  for (const edit of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  return out
}

function main(): void {
  const [mode, ...rest] = process.argv.slice(2)
  if (mode !== 'inventory' && mode !== 'rewrite') {
    console.error('Usage: <inventory|rewrite> <roots…>')
    process.exit(1)
  }
  const roots = rest.filter((a) => !a.startsWith('--'))
  if (roots.length === 0) {
    console.error('Pass at least one root directory (e.g. backend/src).')
    process.exit(1)
  }
  const files: string[] = []
  for (const root of roots) {
    if (statSync(root).isDirectory()) collect(root, files)
    else files.push(root)
  }
  const report: Report = { rewritten: 0, manual: [] }
  let changedFiles = 0
  for (const file of files) {
    const before = readFileSync(file, 'utf8')
    // The definition itself goes with the template's sql.ts.
    if (!before.includes(OLD) || /export const prepareStringForILikeFilter\b/.test(before)) continue
    const calls = rewriteCalls(file, before, report)
    const after = calls.complete ? rewriteImports(file, calls.text) : calls.text
    if (after === before) continue
    changedFiles += 1
    if (mode === 'rewrite') writeFileSync(file, after)
    else console.info(`  ${file}`)
  }
  const verb = mode === 'rewrite' ? 'Rewrote' : 'Would rewrite'
  console.info(`${verb} ${changedFiles} file(s), ${report.rewritten} filter(s), across ${files.length} scanned.`)
  if (report.manual.length) {
    console.info(`\nManual: ${report.manual.length} use(s) the codemod does not rewrite; use textSearchFilter(column, q) there:`)
    for (const at of report.manual) console.info(`  ${at}`)
  }
  if (mode === 'inventory') console.info('\nRun with `rewrite` to apply, then `pnpm lint:fix`.')
}

main()
