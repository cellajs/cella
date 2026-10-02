/**
 * Codemod: let Biome collapse shallow objects at line width 150. Biome keeps an object, type literal or
 * destructuring pattern expanded when the source has a line break right after `{`, so objects it wrapped
 * at 120 would stay wrapped at 150. This script removes that break for multi-line braces that are shallow
 * (no more than one level of nested object, array, pattern or type literal inside), hold no comments,
 * no block-bodied functions and no JSX. `biome format --write` then collapses each one that fits and
 * expands the rest again. Deeper literals (protocol envelopes, document JSON, IAM policies) keep their shape.
 *
 * Roots default to `files.includes` in `biome.jsonc`: a file Biome does not format would keep the removed
 * break without the collapse. Generated trees (`sdk/gen`, `*.gen.*`, `drizzle/`, `api.gen/`) are skipped:
 * they regenerate.
 *
 * In an app, files identical to the upstream commit in `cella/cella.manifest.json` are skipped too: they
 * arrived formatted, and line breaks upstream kept on purpose would collapse into drift.
 *
 * Usage (from the repo root):
 *   pnpm exec tsx cella/migrations/<id>/collapse-objects.ts inventory [roots…]
 *   pnpm exec tsx cella/migrations/<id>/collapse-objects.ts rewrite   [roots…]
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import ts from 'typescript'

const MAX_DEPTH = 2
const EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'gen', 'drizzle', 'api.gen', '.git'])

const braceKinds = new Set([ts.SyntaxKind.ObjectLiteralExpression, ts.SyntaxKind.ObjectBindingPattern, ts.SyntaxKind.TypeLiteral])
const nestingKinds = new Set([
  ...braceKinds,
  ts.SyntaxKind.ArrayLiteralExpression,
  ts.SyntaxKind.ArrayBindingPattern,
  ts.SyntaxKind.TupleType,
])

/** Biome include globs as paths: `dir/**` becomes `dir`, `!path` an exclusion. */
const biomeIncludes = (): { roots: string[]; excluded: string[] } => {
  const { config } = ts.parseConfigFileTextToJson('biome.jsonc', readFileSync('biome.jsonc', 'utf8'))
  const globs: string[] = config?.files?.includes ?? []
  const toPath = (glob: string) => normalize(glob.replace(/^!/, '').replace(/\/\*\*$/, ''))
  return {
    roots: globs.filter((glob) => !glob.startsWith('!')).map(toPath).filter(existsSync),
    excluded: globs.filter((glob) => glob.startsWith('!')).map(toPath),
  }
}

/** Files byte-identical to the last synced upstream commit; empty without a sync manifest (cella itself). */
const upstreamIdentical = (): { commit: string; files: Set<string> } | null => {
  if (!existsSync('cella/cella.manifest.json')) return null
  const commit: string | undefined = JSON.parse(readFileSync('cella/cella.manifest.json', 'utf8'))?.upstream?.commit
  if (!commit) return null
  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean)
  const changed = new Set(git('diff', '--name-only', '-z', commit, '--'))
  return { commit, files: new Set(git('ls-tree', '-r', '--name-only', '-z', commit).filter((file) => !changed.has(file))) }
}

const listFiles = (root: string, excluded: string[]): string[] => {
  if (excluded.some((path) => root === path || root.startsWith(`${path}/`))) return []
  const stat = statSync(root)
  if (stat.isFile()) return EXTENSIONS.has(extname(root)) ? [root] : []
  return readdirSync(root).flatMap((name) => {
    if (SKIP_DIRS.has(name) || name.includes('.gen.')) return []
    return listFiles(join(root, name), excluded)
  })
}

const members = (node: ts.Node): readonly ts.Node[] => {
  if (ts.isObjectLiteralExpression(node)) return node.properties
  if (ts.isObjectBindingPattern(node)) return node.elements
  if (ts.isTypeLiteralNode(node)) return node.members
  return []
}

/** Nesting depth counted in braces, brackets and tuples; 1 for a literal with no nested literal. */
const depthOf = (node: ts.Node): number => {
  let deepest = 0
  const walk = (child: ts.Node) => {
    if (nestingKinds.has(child.kind)) deepest = Math.max(deepest, depthOf(child))
    else ts.forEachChild(child, walk)
  }
  ts.forEachChild(node, walk)
  return deepest + 1
}

/** Comments, block bodies and JSX keep a brace expanded or read badly on one line. */
const holdsBreakingContent = (node: ts.Node, sf: ts.SourceFile): boolean => {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, sf.languageVariant, node.getText(sf))
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) return true
  }
  let found = false
  const walk = (child: ts.Node) => {
    if (found) return
    if (ts.isBlock(child) || ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) found = true
    else ts.forEachChild(child, walk)
  }
  ts.forEachChild(node, walk)
  return found
}

type Edit = { from: number; to: number }

const collectEdits = (sf: ts.SourceFile): Edit[] => {
  const edits: Edit[] = []
  const visit = (node: ts.Node) => {
    if (braceKinds.has(node.kind)) {
      const first = members(node)[0]
      const open = node.getStart(sf)
      if (first && sf.text.slice(open + 1, first.getStart(sf)).includes('\n')) {
        if (depthOf(node) <= MAX_DEPTH && !holdsBreakingContent(node, sf)) edits.push({ from: open + 1, to: first.getStart(sf) })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return edits
}

const [mode, ...rootArgs] = process.argv.slice(2)
if (mode !== 'inventory' && mode !== 'rewrite') {
  console.error('Usage: collapse-objects.ts <inventory|rewrite> [roots…]')
  process.exit(1)
}
const includes = biomeIncludes()
const roots = rootArgs.length > 0 ? rootArgs.map((root) => normalize(root)) : includes.roots
const upstream = upstreamIdentical()

let fileCount = 0
let editCount = 0
let skipCount = 0
for (const file of roots.flatMap((root) => listFiles(root, includes.excluded))) {
  if (upstream?.files.has(file)) {
    skipCount++
    continue
  }
  const text = readFileSync(file, 'utf8')
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
  const edits = collectEdits(sf)
  if (edits.length === 0) continue
  fileCount++
  editCount += edits.length
  if (mode === 'inventory') continue
  let next = text
  for (const { from, to } of edits.sort((a, b) => b.from - a.from)) next = `${next.slice(0, from)} ${next.slice(to)}`
  writeFileSync(file, next)
}

if (upstream) console.log(`skipped ${skipCount} files identical to upstream ${upstream.commit.slice(0, 9)}`)
console.log(`${mode}: ${editCount} braces in ${fileCount} files${mode === 'inventory' ? ' (run rewrite, then biome format --write)' : ''}`)
