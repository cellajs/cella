/**
 * Codemod: Tailwind class conventions after the Tailwind audit.
 *
 * - `icon-xs|sm|md|lg|xl` become `size-3|3.5|4|5|6` (the icon-* utilities are removed).
 * - `[--intent-color:var(--x)]` becomes the `intent-x` utility, `text-[0.6rem]` becomes `text-2xs`.
 * - Button content is spaced by the button's own gap: margins (`mr-2`, `ml-1`, …) on direct children of `<Button>`,
 *   `<SubmitButton>` and `buttonVariants(...)` elements are removed when the button has more than one child.
 * - Shared components name their groups: children of `<Button variant="cell">`, `<Toggle variant="tile">` and
 *   accordion items/triggers move from unnamed `group-*:` variants to `group-*\/cell-button:`, `/toggle:` and
 *   `/accordion-header:`.
 *
 * Usage (from the repo root):
 *   pnpm exec tsx cella/migrations/<id>/tailwind-class-conventions.ts inventory frontend/src
 *   pnpm exec tsx cella/migrations/<id>/tailwind-class-conventions.ts rewrite   frontend/src
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import ts from 'typescript'

const ICON_SIZES: Record<string, string> = { xs: 'size-3', sm: 'size-3.5', md: 'size-4', lg: 'size-5', xl: 'size-6' }
const ICON_RE = /(?<![\w-])icon-(xs|sm|md|lg|xl)(?![\w-])/g
const INTENT_RE = /\[--intent-color:var\(--(primary|brand|destructive|success|secondary|warning)\)\]/g
const MARGIN_RE = /^((?:[a-z-]+:)*)(mr|ml|me|ms)-(0\.5|1|1\.5|2|2\.5|3)$/
const UNNAMED_GROUP_RE = /(?<![\w/-])(group-[a-z-]+(?:-\[[^\]]*\])?|group-\[[^\]]*\]):/g
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.turbo', 'gen'])

/** Recursively collect .ts/.tsx files under a root, skipping generated and vendored dirs. */
function collect(root: string, out: string[]): void {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(full, out)
    } else if (['.ts', '.tsx'].includes(extname(entry.name))) out.push(full)
  }
}

type Edit = { start: number; end: number; text: string }
type Counts = Record<string, number>

/** The group name a shared component's children should use, or null when the element is not one of them. */
function sharedGroup(tag: string, attrs: string): string | null {
  if (tag === 'Button' && /variant=["{']*cell/.test(attrs)) return 'cell-button'
  if ((tag === 'Toggle' || tag === 'ToggleGroupItem') && /variant=["{']*tile/.test(attrs)) return 'toggle'
  if (tag === 'AccordionTrigger' || tag === 'AccordionItem') return 'accordion-header'
  return null
}

/** Whether a JSX element renders as a button whose content the button's gap spaces. */
function isButtonLike(el: ts.JsxElement, src: ts.SourceFile): boolean {
  const tag = el.openingElement.tagName.getText(src)
  if (tag === 'Button' || tag === 'SubmitButton') return true
  return /buttonVariants\(/.test(el.openingElement.attributes.getText(src))
}

/** Direct child elements of a JSX element, looking through fragments, `cond && <X/>` and ternaries. */
function childElements(el: ts.JsxElement | ts.JsxFragment, out: { el?: ts.JsxElement | ts.JsxSelfClosingElement; other?: true }[] = []) {
  for (const c of el.children) {
    if (ts.isJsxText(c)) {
      if (c.getText().trim()) out.push({ other: true })
    } else if (ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c)) out.push({ el: c })
    else if (ts.isJsxFragment(c)) childElements(c, out)
    else if (ts.isJsxExpression(c) && c.expression) {
      const walk = (e: ts.Expression): void => {
        if (ts.isParenthesizedExpression(e)) return walk(e.expression)
        if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e)) out.push({ el: e })
        else if (ts.isJsxFragment(e)) childElements(e, out)
        else if (ts.isBinaryExpression(e)) walk(e.right)
        else if (ts.isConditionalExpression(e)) {
          walk(e.whenTrue)
          walk(e.whenFalse)
        } else out.push({ other: true })
      }
      walk(c.expression)
    }
  }
  return out
}

/** String literals in an element's className (plain or inside a cn(...) call). */
function classStrings(el: ts.JsxElement | ts.JsxSelfClosingElement): (ts.StringLiteral | ts.NoSubstitutionTemplateLiteral)[] {
  const attrs = ts.isJsxElement(el) ? el.openingElement.attributes : el.attributes
  const attr = attrs.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText() === 'className') as ts.JsxAttribute | undefined
  const out: (ts.StringLiteral | ts.NoSubstitutionTemplateLiteral)[] = []
  const init = attr?.initializer
  if (!init) return out
  if (ts.isStringLiteral(init)) out.push(init)
  else if (ts.isJsxExpression(init) && init.expression) {
    const scan = (n: ts.Node): void => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n)
      ts.forEachChild(n, scan)
    }
    if (ts.isCallExpression(init.expression) && init.expression.expression.getText() === 'cn') scan(init.expression)
    else if (ts.isStringLiteral(init.expression)) out.push(init.expression)
  }
  return out
}

/** Collects the AST edits for one file: button child margins and shared-group renames. */
function astEdits(src: ts.SourceFile, counts: Counts): Edit[] {
  const edits: Edit[] = []
  const quoted = (lit: ts.Node, text: string) => {
    const q = lit.getText(src)[0]
    return q + text + q
  }
  const renameGroups = (node: ts.Node, name: string): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (UNNAMED_GROUP_RE.test(node.text)) {
        UNNAMED_GROUP_RE.lastIndex = 0
        counts[`group -> /${name}`] = (counts[`group -> /${name}`] ?? 0) + 1
        edits.push({ start: node.getStart(src), end: node.getEnd(), text: quoted(node, node.text.replace(UNNAMED_GROUP_RE, (_m, g: string) => `${g}/${name}:`)) })
      }
      UNNAMED_GROUP_RE.lastIndex = 0
    }
    ts.forEachChild(node, (c) => renameGroups(c, name))
  }
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node)) {
      const group = sharedGroup(node.openingElement.tagName.getText(src), node.openingElement.attributes.getText(src))
      if (group) for (const c of node.children) renameGroups(c, group)
      if (isButtonLike(node, src)) {
        const kids = childElements(node)
        if (kids.length >= 2) {
          for (const { el } of kids) {
            if (!el) continue
            for (const lit of classStrings(el)) {
              const tokens = lit.text.split(/\s+/).filter(Boolean)
              if (!tokens.some((t) => MARGIN_RE.test(t))) continue
              counts['button child margin'] = (counts['button child margin'] ?? 0) + 1
              edits.push({ start: lit.getStart(src), end: lit.getEnd(), text: quoted(lit, tokens.filter((t) => !MARGIN_RE.test(t)).join(' ')) })
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(src)
  return edits
}

/** Applies every rewrite to one file's text. */
function rewrite(file: string, source: string, counts: Counts): string {
  let text = source
  if (file.endsWith('.tsx')) {
    const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const edits = astEdits(src, counts)
    // Edits can overlap when a button child is also inside a shared group: keep the outermost first edit per range.
    const sorted = edits.sort((a, b) => b.start - a.start)
    let lastStart = Number.POSITIVE_INFINITY
    for (const e of sorted) {
      if (e.end > lastStart) continue
      text = text.slice(0, e.start) + e.text + text.slice(e.end)
      lastStart = e.start
    }
  }
  text = text.replace(ICON_RE, (_m, size: string) => {
    counts[`icon-${size} -> ${ICON_SIZES[size]}`] = (counts[`icon-${size} -> ${ICON_SIZES[size]}`] ?? 0) + 1
    return ICON_SIZES[size]
  })
  text = text.replace(INTENT_RE, (_m, token: string) => {
    counts['[--intent-color:…] -> intent-*'] = (counts['[--intent-color:…] -> intent-*'] ?? 0) + 1
    return `intent-${token}`
  })
  text = text.replace(/text-\[0\.6rem\]/g, () => {
    counts['text-[0.6rem] -> text-2xs'] = (counts['text-[0.6rem] -> text-2xs'] ?? 0) + 1
    return 'text-2xs'
  })
  return text
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
  const counts: Counts = {}
  let changedFiles = 0
  for (const file of files) {
    const before = readFileSync(file, 'utf8')
    const after = rewrite(file, before, counts)
    if (after === before) continue
    changedFiles += 1
    if (mode === 'rewrite') writeFileSync(file, after)
    else console.info(`  ${file}`)
  }
  const verb = mode === 'rewrite' ? 'Rewrote' : 'Would rewrite'
  console.info(`${verb} ${changedFiles} file(s) across ${files.length} scanned.`)
  for (const [name, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.info(`  ${name}: ${n}`)
  if (mode === 'inventory') console.info('\nRun with `rewrite` to apply, then `pnpm lint:fix` (it re-sorts the touched classes).')
}

main()
