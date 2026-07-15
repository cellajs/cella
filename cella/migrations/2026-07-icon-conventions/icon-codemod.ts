/**
 * Icon conventions codemod for cella.
 *
 * Converts icon usage to the runtime-only convention:
 * - direct `lucide-react` imports with modern `*Icon`-suffixed names
 *   (deprecated aliases normalized via deprecated-renames.json)
 * - sizing via classes only (`icon-xs/sm/md/lg/xl` utilities or size-*),
 *   never lucide's px-based `size` prop — a global `:where(svg.lucide)`
 *   rule overrides the px attributes, so the prop is inert
 * - no per-icon `strokeWidth={appConfig.theme.strokeWidth}` (the app-root
 *   `LucideProvider` supplies it)
 *
 * Handles both pre-wrapper input (raw lucide imports, numeric size props)
 * and the interim wrapper form (barrel imports, token size props), and is
 * idempotent on converted code.
 *
 * Modes:
 *   inventory — report only (no writes)
 *   rewrite   — apply
 *
 * Usage (repo root): pnpm exec tsx cella/migrations/2026-07-icon-conventions/icon-codemod.ts <inventory|rewrite> frontend/src
 * Afterwards: biome check --write, typecheck, and review the report this
 * script writes next to itself (manual-review lists).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

const mode = process.argv[2];
const srcDir = process.argv[3];
if (!mode || !srcDir) throw new Error('usage: icon-codemod.ts <inventory|rewrite> <srcDir>');

const BARREL = '~/modules/common/icons';
const CUSTOM_ICONS: Record<string, string> = {
  GithubIcon: `${BARREL}/github`,
  ElementIcon: `${BARREL}/element`,
};
const TYPE_MAP: Record<string, string> = { IconComponent: 'LucideIcon', IconProps: 'LucideProps' };
// px -> class. 16 maps to null: the :where(svg.lucide) default already renders 1rem.
const PX_CLASS: Record<string, string | null> = { '12': 'icon-xs', '14': 'icon-sm', '16': null, '20': 'icon-lg', '24': 'icon-xl' };
const TOKEN_CLASS: Record<string, string> = { xs: 'icon-xs', sm: 'icon-sm', md: 'icon-md', lg: 'icon-lg', xl: 'icon-xl' };
// deprecated lucide alias -> canonical modern name (built from lucide-react 1.23 d.ts)
const DEPRECATED_MAP: Record<string, string> = JSON.parse(
  fs.readFileSync(new URL('./deprecated-renames.json', import.meta.url), 'utf8'),
);

function pxToClass(px: number): string | null {
  const key = String(px);
  if (key in PX_CLASS) return PX_CLASS[key];
  const quarter = px / 4;
  return Number.isInteger(quarter * 2) ? `size-${quarter}` : `size-[${px / 16}rem]`;
}

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** Canonical lucide-react import name: *Icon suffix, modern (non-deprecated) name. */
function canonical(name: string): string {
  if (name in TYPE_MAP) return TYPE_MAP[name];
  if (name.startsWith('Lucide') || name in CUSTOM_ICONS) return name;
  const suffixed = name.endsWith('Icon') ? name : `${name}Icon`;
  return DEPRECATED_MAP[suffixed] ?? suffixed;
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

const manualReview: string[] = [];
const bareReport: string[] = [];
// numeric size={N} on tags the codemod can't identify as icons (prop-aliased
// icons like <Icon>, <item.icon>). The prop is inert post-migration — every
// entry needs a human decision (usually: intended-size class, or delete).
const sizePropReport: string[] = [];
let filesTouched = 0;

const iconsModuleDir = path.join(srcDir, 'modules/common/icons');
const files = walkFiles(srcDir).filter((f) => !f.startsWith(iconsModuleDir));

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('lucide-react') && !text.includes(BARREL)) continue;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  // ---- collect icon imports (raw lucide or barrel) ----
  interface ImportSpec {
    name: string;
    alias: string;
    isType: boolean;
  }
  const imports: ImportSpec[] = [];
  const importDecls: ts.ImportDeclaration[] = [];
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const spec = (stmt.moduleSpecifier as ts.StringLiteral).text;
    if (spec !== 'lucide-react' && spec !== BARREL) continue;
    const clause = stmt.importClause;
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
      manualReview.push(`${file}: non-named icon import (${stmt.getText(sf).slice(0, 80)})`);
      continue;
    }
    importDecls.push(stmt);
    for (const el of clause.namedBindings.elements) {
      const name = (el.propertyName ?? el.name).text;
      const alias = el.name.text;
      if (name === 'wrapIcon' || name === 'iconSizes' || name === 'IconSize' || name === 'iconSizeAttrs') {
        manualReview.push(`${file}: imports removed helper '${name}' — rework by hand`);
        continue;
      }
      imports.push({ name, alias, isType: clause.isTypeOnly || el.isTypeOnly });
    }
  }
  if (importDecls.length === 0) continue;

  // local alias -> canonical name (identifier rename)
  const renames = new Map<string, string>();
  for (const imp of imports) {
    const canon = canonical(imp.name);
    if (imp.alias !== imp.name && imp.alias !== canon) continue; // user-chosen alias, keep
    if (imp.alias !== canon) renames.set(imp.alias, canon);
  }
  const iconLocalNames = new Set(imports.filter((i) => !(i.name in TYPE_MAP) && !i.isType).map((i) => i.alias));

  const edits: Edit[] = [];
  let strokeRemoved = 0;

  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && renames.has(node.text)) {
      const inImport = importDecls.some((d) => node.pos >= d.pos && node.end <= d.end);
      const parent = node.parent;
      const isPropName =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node);
      if (!inImport && !isPropName) {
        edits.push({ start: node.getStart(sf), end: node.getEnd(), text: renames.get(node.text)! });
      }
    }

    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName;
      const tagIsIcon = ts.isIdentifier(tag) && iconLocalNames.has(tag.text);
      const tagMaybeIcon =
        !tagIsIcon &&
        (ts.isPropertyAccessExpression(tag) || (ts.isIdentifier(tag) && /^[A-Z]/.test(tag.text)));
      if (tagMaybeIcon) {
        for (const attr of node.attributes.properties) {
          if (
            ts.isJsxAttribute(attr) &&
            ts.isIdentifier(attr.name) &&
            attr.name.text === 'size' &&
            attr.initializer &&
            ts.isJsxExpression(attr.initializer) &&
            attr.initializer.expression &&
            ts.isNumericLiteral(attr.initializer.expression)
          ) {
            sizePropReport.push(
              `${file}:${line(sf, node)}: <${tag.getText(sf)} size={${attr.initializer.expression.text}}> — inert if this renders an icon; move to a class`,
            );
          }
        }
      }
      if (tagIsIcon) {
        let sizeAttr: ts.JsxAttribute | undefined;
        let sizeClass: string | null | undefined;
        let classAttr: ts.JsxAttribute | undefined;

        for (const attr of node.attributes.properties) {
          if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name)) continue;
          const attrName = attr.name.text;

          if (attrName === 'size' && attr.initializer) {
            const init = attr.initializer;
            if (ts.isStringLiteral(init)) {
              const v = init.text;
              sizeClass = v in TOKEN_CLASS ? TOKEN_CLASS[v] : /^\d+$/.test(v) ? pxToClass(Number(v)) : undefined;
            } else if (ts.isJsxExpression(init) && init.expression && ts.isNumericLiteral(init.expression)) {
              sizeClass = pxToClass(Number(init.expression.text));
            }
            if (sizeClass !== undefined) sizeAttr = attr;
            else manualReview.push(`${file}:${line(sf, node)}: <${tag.getText(sf)}> dynamic size prop — convert by hand`);
          }

          if (attrName === 'className') classAttr = attr;

          if (
            attrName === 'strokeWidth' &&
            attr.initializer &&
            ts.isJsxExpression(attr.initializer) &&
            attr.initializer.expression?.getText(sf) === 'appConfig.theme.strokeWidth'
          ) {
            if (mode === 'rewrite') {
              edits.push({ start: attr.getFullStart(), end: attr.getEnd(), text: '' });
              strokeRemoved++;
            }
          }
        }

        if (sizeAttr && mode === 'rewrite') {
          if (sizeClass === null) {
            // 16px/md: matches the :where(svg.lucide) default — drop the prop
            edits.push({ start: sizeAttr.getFullStart(), end: sizeAttr.getEnd(), text: '' });
          } else if (!classAttr) {
            edits.push({ start: sizeAttr.getStart(sf), end: sizeAttr.getEnd(), text: `className="${sizeClass}"` });
          } else if (classAttr.initializer && ts.isStringLiteral(classAttr.initializer)) {
            const lit = classAttr.initializer;
            edits.push({ start: sizeAttr.getFullStart(), end: sizeAttr.getEnd(), text: '' });
            edits.push({ start: lit.getStart(sf) + 1, end: lit.getStart(sf) + 1, text: `${sizeClass} ` });
          } else if (
            classAttr.initializer &&
            ts.isJsxExpression(classAttr.initializer) &&
            classAttr.initializer.expression &&
            ts.isCallExpression(classAttr.initializer.expression) &&
            classAttr.initializer.expression.expression.getText(sf) === 'cn'
          ) {
            const call = classAttr.initializer.expression;
            edits.push({ start: sizeAttr.getFullStart(), end: sizeAttr.getEnd(), text: '' });
            edits.push({ start: call.arguments.pos, end: call.arguments.pos, text: `'${sizeClass}', ` });
          } else {
            manualReview.push(`${file}:${line(sf, node)}: <${tag.getText(sf)}> size + dynamic className — merge '${sizeClass}' by hand`);
          }
        }

        if (!sizeAttr && !classAttr) bareReport.push(`${file}:${line(sf, node)}: <${tag.getText(sf)}> (defaults to 1rem)`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (mode !== 'rewrite') continue;

  // ---- rebuild imports: lucide-react + custom icon deep imports ----
  const lucideNames = new Set<string>();
  const customImports = new Map<string, Set<string>>();
  for (const imp of imports) {
    const canon = canonical(imp.name);
    const keepAlias = imp.alias !== imp.name && imp.alias !== canon;
    const rendered = (keepAlias ? `${canon} as ${imp.alias}` : canon) + '';
    if (canon in CUSTOM_ICONS) {
      const set = customImports.get(CUSTOM_ICONS[canon]) ?? new Set();
      set.add(rendered);
      customImports.set(CUSTOM_ICONS[canon], set);
    } else {
      lucideNames.add((imp.isType || imp.name in TYPE_MAP ? 'type ' : '') + rendered);
    }
  }
  const lines: string[] = [];
  if (lucideNames.size > 0) {
    const sorted = [...lucideNames].sort((a, b) => a.replace('type ', '').localeCompare(b.replace('type ', '')));
    lines.push(`import { ${sorted.join(', ')} } from 'lucide-react';`);
  }
  for (const [spec, names] of customImports) {
    lines.push(`import { ${[...names].sort().join(', ')} } from '${spec}';`);
  }
  importDecls.forEach((decl, i) => {
    if (i === 0) {
      edits.push({ start: decl.getStart(sf), end: decl.getEnd(), text: lines.join('\n') });
    } else {
      let end = decl.getEnd();
      if (text[end] === '\n') end++;
      edits.push({ start: decl.getStart(sf), end, text: '' });
    }
  });

  // ---- drop appConfig import if it became unused ----
  if (strokeRemoved > 0) {
    const appConfigIds: ts.Identifier[] = [];
    const findAppConfig = (n: ts.Node) => {
      if (ts.isIdentifier(n) && n.text === 'appConfig') appConfigIds.push(n);
      ts.forEachChild(n, findAppConfig);
    };
    findAppConfig(sf);
    const stillUsed = appConfigIds.some((id) => {
      const inImport = sf.statements.some((s) => ts.isImportDeclaration(s) && id.pos >= s.pos && id.end <= s.end);
      if (inImport) return false;
      return !edits.some((e) => e.text === '' && id.getStart(sf) >= e.start && id.getEnd() <= e.end);
    });
    if (!stillUsed) {
      for (const stmt of sf.statements) {
        if (!ts.isImportDeclaration(stmt)) continue;
        const clause = stmt.importClause;
        if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
        const els = clause.namedBindings.elements;
        const target = els.find((e) => e.name.text === 'appConfig');
        if (!target) continue;
        if (els.length === 1) {
          let end = stmt.getEnd();
          if (text[end] === '\n') end++;
          edits.push({ start: stmt.getStart(sf), end, text: '' });
        } else {
          const idx = els.indexOf(target);
          const start = idx === 0 ? target.getStart(sf) : els[idx - 1].getEnd();
          const end = idx === 0 ? els[idx + 1].getStart(sf) : target.getEnd();
          edits.push({ start, end, text: '' });
        }
      }
    }
  }

  // ---- apply edits (reverse order, overlap-guarded) ----
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let result = text;
  let prevStart = Number.POSITIVE_INFINITY;
  for (const e of edits) {
    if (e.end > prevStart) {
      console.error(`OVERLAP in ${file} at ${e.start}-${e.end}, skipping edit`);
      continue;
    }
    result = result.slice(0, e.start) + e.text + result.slice(e.end);
    prevStart = e.start;
  }
  if (result !== text) {
    fs.writeFileSync(file, result);
    filesTouched++;
  }
}

function line(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

const report = { filesTouched, manualReview, numericSizeProps: sizePropReport, bareUsages: bareReport };
fs.writeFileSync(
  path.join(path.dirname(new URL(import.meta.url).pathname), `icon-report-${mode}.json`),
  JSON.stringify(report, null, 2),
);
console.log(
  `${mode} done: ${filesTouched} files written, ${manualReview.length} manual-review items, ${sizePropReport.length} numeric size props on unidentified tags, ${bareReport.length} bare usages`,
);
