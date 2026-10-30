import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileScope, printHeader, repoRoot as repo } from './lib.mjs';

// Classifies every prop use of every frontend component and lists the call sites and values of style-only props, as leads
// for the props pass in passes.md. Usage: node prop-table.mjs <output json>
const outFile = process.argv[2];
if (!outFile) {
  console.error('usage: node prop-table.mjs <output json>');
  process.exit(2);
}
printHeader();
const scope = fileScope();
const ts = createRequire(path.join(repo, 'package.json'))('typescript');
const fe = path.join(repo, 'frontend');
const cfgPath = path.join(fe, 'tsconfig.json');
const parsed = ts.getParsedCommandLineOfConfigFile(
  cfgPath,
  {},
  {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(String(d.messageText));
    },
  },
);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
const srcRoot = path.join(fe, 'src') + path.sep;
const realSrcRoot = srcRoot;
const inSrc = (f) => f.startsWith(realSrcRoot) || f.startsWith(srcRoot);
const rel = (f) => path.relative(repo, f);
const files = program
  .getSourceFiles()
  .filter((sf) => inSrc(sf.fileName) && !sf.fileName.includes('.gen.') && !sf.fileName.endsWith('.d.ts') && !sf.isDeclarationFile);
const fileKind = (f) => (/\.stories\.tsx?$/.test(f) ? 'story' : /\.test\.tsx?$/.test(f) ? 'test' : 'src');

const classFns = new Set(['clsx', 'cn', 'cx', 'tw', 'twJoin', 'twMerge', 'cva']);
const isClassAttr = (n) => n === 'className' || n === 'class' || /ClassNames?$/.test(n) || /Classes$/.test(n);
const isPascal = (s) => /^[A-Z]/.test(s);

const resolve = (sym) => {
  let s = sym;
  while (s && s.flags & ts.SymbolFlags.Alias) {
    try {
      s = checker.getAliasedSymbol(s);
    } catch {
      break;
    }
  }
  return s;
};
const symAt = (node) => {
  const s = checker.getSymbolAtLocation(node);
  return s ? resolve(s) : undefined;
};
const lineOf = (node) => {
  const sf = node.getSourceFile();
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
};
const posOf = (node) => `${rel(node.getSourceFile().fileName)}:${lineOf(node)}`;
const textOf = (node, max = 80) => {
  const t = node.getText().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max)}...` : t;
};

const hasJsx = (node) => {
  let f = false;
  const w = (n) => {
    if (f) return;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) {
      f = true;
      return;
    }
    ts.forEachChild(n, w);
  };
  w(node);
  return f;
};

// cva-produced functions count as class functions.
const isCvaFn = (sym) => {
  const d = sym?.valueDeclaration;
  if (!d || !ts.isVariableDeclaration(d) || !d.initializer) return false;
  const i = d.initializer;
  return ts.isCallExpression(i) && ts.isIdentifier(i.expression) && i.expression.text === 'cva';
};

// 1. Discover components.
const components = new Map(); // symbol -> component
const lazyAliases = []; // [lazy var symbol, ImportCall literal, exportName]
const memoAliases = [];
const unwrapFn = (init) => {
  if (!init) return undefined;
  if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return init;
  if (ts.isParenthesizedExpression(init) || ts.isAsExpression(init) || ts.isSatisfiesExpression(init)) return unwrapFn(init.expression);
  if (ts.isCallExpression(init)) {
    const n = ts.isIdentifier(init.expression)
      ? init.expression.text
      : ts.isPropertyAccessExpression(init.expression)
        ? init.expression.name.text
        : '';
    if (n === 'memo' || n === 'forwardRef') return unwrapFn(init.arguments[0]);
  }
  return undefined;
};
const lazyTarget = (init) => {
  if (!init || !ts.isCallExpression(init)) return undefined;
  const n = ts.isIdentifier(init.expression) ? init.expression.text : ts.isPropertyAccessExpression(init.expression) ? init.expression.name.text : '';
  if (n !== 'lazy' && n !== 'lazyNamed') return undefined;
  let lit;
  let name = 'default';
  if (n === 'lazyNamed' && init.arguments[1] && ts.isStringLiteralLike(init.arguments[1])) name = init.arguments[1].text;
  const w = (x) => {
    if (ts.isCallExpression(x) && x.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteralLike(x.arguments[0])) lit = x.arguments[0];
    if (ts.isPropertyAssignment(x) && ts.isIdentifier(x.name) && x.name.text === 'default' && ts.isPropertyAccessExpression(x.initializer))
      name = x.initializer.name.text;
    ts.forEachChild(x, w);
  };
  w(init);
  return lit ? { lit, name } : undefined;
};

for (const sf of files) {
  const walk = (node) => {
    let fn;
    let nameNode;
    if (ts.isFunctionDeclaration(node) && node.name && isPascal(node.name.text) && node.body) {
      fn = node;
      nameNode = node.name;
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && isPascal(node.name.text)) {
      const lz = lazyTarget(node.initializer);
      if (lz) lazyAliases.push([symAt(node.name), lz.lit, lz.name]);
      let mi = node.initializer;
      while (mi && (ts.isAsExpression(mi) || ts.isParenthesizedExpression(mi) || ts.isSatisfiesExpression(mi))) mi = mi.expression;
      if (mi && ts.isCallExpression(mi) && mi.arguments[0] && ts.isIdentifier(mi.arguments[0])) {
        const cn = ts.isIdentifier(mi.expression) ? mi.expression.text : ts.isPropertyAccessExpression(mi.expression) ? mi.expression.name.text : '';
        if (cn === 'memo' || cn === 'forwardRef') memoAliases.push([symAt(node.name), mi.arguments[0]]);
      }
      fn = unwrapFn(node.initializer);
      nameNode = node.name;
    }
    if (fn && fn.body && hasJsx(fn.body)) {
      const sym = symAt(nameNode);
      if (sym && !components.has(sym))
        components.set(sym, {
          name: nameNode.text,
          fn,
          sym,
          file: rel(sf.fileName),
          line: lineOf(nameNode),
          kind: fileKind(sf.fileName),
          exported: !!(sym.parent || ts.getCombinedModifierFlags(ts.isVariableDeclaration(node) ? node : node) & ts.ModifierFlags.Export),
          props: new Map(),
          rests: [],
        });
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
}
const lazyMap = new Map();
for (const [v, lit, name] of lazyAliases) {
  const mod = checker.getSymbolAtLocation(lit);
  if (!mod) continue;
  const ex = checker.getExportsOfModule(mod).find((e) => e.name === name);
  if (ex && v) lazyMap.set(v, resolve(ex));
}
for (const [v, id] of memoAliases) {
  const t = symAt(id);
  if (v && t) lazyMap.set(v, t);
}
const compOf = (sym) => components.get(lazyMap.get(sym) ?? sym);

// 2. Classify every reference to a local.
const tagSym = (el) => symAt(el.tagName);
const isIntrinsic = (el) => ts.isIdentifier(el.tagName) && /^[a-z]/.test(el.tagName.text);

function classifyRef(id, comp, seen) {
  // Exact pass-through: the attribute value is the identifier itself.
  let cur = id;
  let exact = true;
  while (cur.parent) {
    const p = cur.parent;
    if (ts.isJsxExpression(p)) {
      const gp = p.parent;
      if (ts.isJsxAttribute(gp)) {
        const attr = gp.name.getText();
        const el = gp.parent.parent;
        if (isClassAttr(attr)) return [{ kind: 'class', attr, at: posOf(id) }];
        if (attr === 'style') return [{ kind: 'styleAttr', at: posOf(id) }];
        if (attr.startsWith('data-')) return [{ kind: 'data', attr, at: posOf(id) }];
        if (attr.startsWith('aria-')) return [{ kind: 'aria', attr, at: posOf(id) }];
        if (isIntrinsic(el)) return [{ kind: 'behavior', why: `<${el.tagName.getText()} ${attr}>`, at: posOf(id) }];
        if (p.expression && hasJsx(p.expression)) return [{ kind: 'behavior', why: `JSX-valued ${attr}`, at: posOf(id) }];
        return [{ kind: 'forward', exact, attr, target: tagSym(el), tag: el.tagName.getText(), at: posOf(id), expr: textOf(p.expression) }];
      }
      if (ts.isJsxSpreadAttribute(gp)) return [{ kind: 'behavior', why: 'spread', at: posOf(id) }];
      return [{ kind: 'behavior', why: 'jsx child', at: posOf(id) }];
    }
    if (ts.isJsxSpreadAttribute(p)) {
      const el = p.parent.parent;
      return [{ kind: 'spread', el, at: posOf(id) }];
    }
    if (ts.isShorthandPropertyAssignment(p) || ts.isPropertyAssignment(p)) {
      exact = false;
    }
    if (ts.isCallExpression(p) && cur !== p.expression) {
      const calleeId = ts.isIdentifier(p.expression) ? p.expression : undefined;
      if (calleeId && classFns.has(calleeId.text)) return [{ kind: 'class', attr: calleeId.text, at: posOf(id) }];
      const cs = calleeId ? symAt(calleeId) : undefined;
      if (isCvaFn(cs)) return [{ kind: 'class', attr: `cva:${calleeId.text}`, cva: true, at: posOf(id) }];
      if (calleeId && /^use[A-Z]/.test(calleeId.text) && !['useMemo'].includes(calleeId.text))
        return [{ kind: 'behavior', why: `${calleeId.text}()`, at: posOf(id) }];
      exact = false;
    }
    if (ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isFunctionDeclaration(p)) {
      // A useMemo callback passes through; anything else is a closure run for behavior unless JSX attr was hit first.
      const call = p.parent;
      if (ts.isCallExpression(call) && ts.isIdentifier(call.expression) && call.expression.text === 'useMemo') {
        cur = call;
        exact = false;
        continue;
      }
      if (p === comp.fn) return [{ kind: 'behavior', why: 'top-level expr', at: posOf(id) }];
      return [{ kind: 'behavior', why: 'closure', at: posOf(id) }];
    }
    if (ts.isVariableDeclaration(p) && cur === p.initializer) {
      if (!ts.isIdentifier(p.name)) return [{ kind: 'behavior', why: 'destructure', at: posOf(id) }];
      const vs = symAt(p.name);
      if (seen.has(vs)) return [];
      seen.add(vs);
      const refs = refsOf(vs, comp.fn, p.name);
      if (!refs.length) return [{ kind: 'behavior', why: `unused local ${p.name.text}`, at: posOf(id) }];
      return refs.flatMap((r) => classifyRef(r, comp, seen).map((u) => ({ ...u, exact: false, via: p.name.text })));
    }
    if (ts.isIfStatement(p) && cur === p.expression) return [{ kind: 'behavior', why: 'if', at: posOf(id) }];
    if (
      ts.isReturnStatement(p) ||
      ts.isExpressionStatement(p) ||
      ts.isThrowStatement(p) ||
      ts.isSwitchStatement(p) ||
      ts.isForOfStatement(p) ||
      ts.isForStatement(p) ||
      ts.isWhileStatement(p)
    )
      return [{ kind: 'behavior', why: ts.SyntaxKind[p.kind], at: posOf(id) }];
    if (ts.isJsxElement(p) || ts.isJsxFragment(p)) return [{ kind: 'behavior', why: 'jsx child', at: posOf(id) }];
    if (!ts.isParenthesizedExpression(p) && !ts.isAsExpression(p) && !ts.isSatisfiesExpression(p) && !ts.isNonNullExpression(p)) exact = false;
    // A conditional that selects between JSX renders, not a class.
    if (ts.isConditionalExpression(p) && cur === p.condition && (hasJsx(p.whenTrue) || hasJsx(p.whenFalse)))
      return [{ kind: 'behavior', why: 'renders JSX', at: posOf(id) }];
    if (ts.isBinaryExpression(p) && cur === p.left && hasJsx(p.right)) return [{ kind: 'behavior', why: 'renders JSX', at: posOf(id) }];
    cur = p;
  }
  return [{ kind: 'behavior', why: 'root', at: posOf(id) }];
}

function refsOf(sym, scope, declName) {
  const out = [];
  const w = (n) => {
    if (ts.isIdentifier(n) && n !== declName) {
      let s;
      if (ts.isShorthandPropertyAssignment(n.parent)) s = checker.getShorthandAssignmentValueSymbol(n.parent);
      else if (ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) s = undefined;
      else if (ts.isPropertyAssignment(n.parent) && n.parent.name === n) s = undefined;
      else if (ts.isJsxAttribute(n.parent) && n.parent.name === n) s = undefined;
      else s = checker.getSymbolAtLocation(n);
      if (s && s === sym) out.push(n);
    }
    ts.forEachChild(n, w);
  };
  w(scope);
  return out;
}

function ownDeclaredProps(param) {
  const t = checker.getTypeAtLocation(param);
  const out = new Map();
  for (const p of checker.getApparentProperties ? t.getApparentProperties() : t.getProperties()) {
    const ds = p.declarations ?? [];
    const own = ds.some((d) => inSrc(d.getSourceFile().fileName));
    out.set(p.name, { own, sym: p, type: checker.typeToString(checker.getTypeOfSymbolAtLocation(p, param)) });
  }
  return out;
}

for (const comp of components.values()) {
  const param = comp.fn.parameters[0];
  if (!param) continue;
  const declared = ownDeclaredProps(param);
  comp.declared = declared;
  const addProp = (name, local, def) => {
    const refs = local ? refsOf(symAt(local), comp.fn, local) : [];
    const uses = refs.flatMap((r) => classifyRef(r, comp, new Set()));
    comp.props.set(name, {
      name,
      def: def ? textOf(def, 40) : undefined,
      uses,
      type: declared.get(name)?.type,
      own: declared.get(name)?.own ?? false,
      destructured: true,
    });
  };
  const addBinding = (pat) => {
    for (const el of pat.elements) {
      if (el.dotDotDotToken) {
        const s = symAt(el.name);
        for (const r of refsOf(s, comp.fn, el.name)) {
          const us = classifyRef(r, comp, new Set());
          comp.rests.push(...us);
        }
        continue;
      }
      const name = el.propertyName ? el.propertyName.getText() : el.name.getText();
      if (!ts.isIdentifier(el.name)) {
        comp.props.set(name, {
          name,
          uses: [{ kind: 'behavior', why: 'nested destructure', at: posOf(el) }],
          own: true,
          type: declared.get(name)?.type,
          destructured: true,
        });
        continue;
      }
      addProp(name, el.name, el.initializer);
    }
  };
  if (ts.isObjectBindingPattern(param.name)) addBinding(param.name);
  else if (ts.isIdentifier(param.name)) {
    const ps = symAt(param.name);
    for (const r of refsOf(ps, comp.fn, param.name)) {
      const par = r.parent;
      if (ts.isPropertyAccessExpression(par) && par.expression === r) {
        const name = par.name.text;
        const entry = comp.props.get(name) ?? {
          name,
          uses: [],
          own: declared.get(name)?.own ?? false,
          type: declared.get(name)?.type,
          destructured: false,
        };
        entry.uses.push(...classifyRef(par, comp, new Set()));
        comp.props.set(name, entry);
      } else if (ts.isVariableDeclaration(par) && ts.isObjectBindingPattern(par.name)) addBinding(par.name);
      else comp.rests.push(...classifyRef(r, comp, new Set()));
    }
  }
  // Props reachable only through ...rest.
  for (const [name, d] of declared) {
    if (!comp.props.has(name) && d.own) comp.props.set(name, { name, uses: [], own: true, type: d.type, destructured: false, viaRest: true });
  }
}

// 3. Fixpoint: a prop is style-only when each use is a class position or a forward into a style-only prop.
function targetStatus(use, stack) {
  const t = compOf(use.target);
  if (!t) return { style: false, reason: `external:${use.tag}.${use.attr}` };
  return propStatus(t, use.attr, stack);
}
const memo = new Map();
function propStatus(comp, name, stack = new Set()) {
  const key = `${comp.file}:${comp.line}:${name}`;
  if (memo.has(key)) return memo.get(key);
  if (stack.has(key)) return { style: false, reason: 'cycle' };
  stack.add(key);
  let res;
  if (isClassAttr(name) && !comp.props.get(name)) res = { style: true, depth: 0, leaf: true };
  else {
    const p = comp.props.get(name);
    let uses = p?.uses ?? [];
    // A prop not destructured flows through rest.
    if (!p?.destructured) {
      const fromRest = comp.rests
        .filter((u) => u.kind === 'spread')
        .map((u) => {
          const el = u.el;
          if (isIntrinsic(el))
            return {
              kind: isClassAttr(name) ? 'class' : name.startsWith('data-') ? 'data' : name.startsWith('aria-') ? 'aria' : 'behavior',
              why: `rest onto <${el.tagName.getText()}>`,
              at: u.at,
            };
          return { kind: 'forward', exact: true, attr: name, target: tagSym(el), tag: el.tagName.getText(), at: u.at, viaRest: true };
        });
      uses = uses.concat(fromRest);
    }
    if (!uses.length) res = { style: false, reason: 'unused', unused: true };
    else {
      let style = true;
      let depth = 0;
      const chain = [];
      const reasons = [];
      for (const u of uses) {
        if (['class', 'styleAttr', 'data', 'aria'].includes(u.kind)) continue;
        if (u.kind === 'spread') {
          style = false;
          reasons.push('spread');
          continue;
        }
        if (u.kind === 'behavior') {
          style = false;
          reasons.push(u.why);
          continue;
        }
        if (u.kind === 'forward') {
          const s = targetStatus(u, stack);
          if (!s.style) {
            style = false;
            reasons.push(s.reason ?? `${u.tag}.${u.attr} not style`);
          } else {
            depth = Math.max(depth, (s.depth ?? 0) + 1);
            chain.push(`${u.tag}.${u.attr}${u.exact ? '' : '~'}${s.chain ? ` > ${s.chain}` : ''}`);
          }
        }
      }
      res = { style, depth, chain: chain.join(' | '), reason: reasons.join(', ') };
    }
  }
  stack.delete(key);
  memo.set(key, res);
  return res;
}

// 4. Call sites.
const sites = new Map(); // comp -> [{attrs, spreads, at, kind}]
for (const sf of files) {
  const w = (n) => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      if (!isIntrinsic(n)) {
        const c = compOf(tagSym(n));
        if (c) {
          const attrs = new Map();
          let spreads = [];
          for (const a of n.attributes.properties) {
            if (ts.isJsxAttribute(a)) {
              const v = a.initializer;
              const val = !v ? 'true' : ts.isStringLiteral(v) ? JSON.stringify(v.text) : v.expression ? textOf(v.expression, 90) : '';
              attrs.set(a.name.getText(), {
                val,
                dynamic: !!(
                  v &&
                  !ts.isStringLiteral(v) &&
                  v.expression &&
                  !ts.isStringLiteralLike(v.expression) &&
                  !/^(true|false|\d+)$/.test(v.expression.getText())
                ),
              });
            } else spreads.push(textOf(a.expression, 40));
          }
          if (!sites.has(c)) sites.set(c, []);
          sites.get(c).push({ attrs, spreads, at: posOf(n), kind: fileKind(sf.fileName) });
        }
      }
    }
    ts.forEachChild(n, w);
  };
  w(sf);
}

// 5. Report rows.
const rows = [];
let totalProps = 0;
const statusCount = { styleOnlyDirect: 0, styleOnlyDrilled: 0, attrOnly: 0, mixedWithClass: 0, unused: 0, behavior: 0 };
const mixedLeads = [];
for (const comp of components.values()) {
  if (comp.kind !== 'src') continue;
  for (const [name, p] of comp.props) {
    if (name === 'className' || name === 'children' || name === 'ref' || name === 'key') continue;
    if (!p.own && !isClassAttr(name) && !p.destructured) continue;
    totalProps++;
    const st = propStatus(comp, name);
    const kinds = [...new Set(p.uses.map((u) => u.kind))];
    const hasClass = kinds.includes('class') || kinds.includes('styleAttr');
    if (st.unused) {
      statusCount.unused++;
      rows.push({ comp: comp.name, at: `${comp.file}:${comp.line}`, prop: name, cat: 'unused', type: p.type, viaRest: p.viaRest });
      continue;
    }
    if (!st.style) {
      if (hasClass) {
        statusCount.mixedWithClass++;
        mixedLeads.push({
          comp: comp.name,
          at: `${comp.file}:${comp.line}`,
          prop: name,
          type: p.type,
          kinds,
          aria: p.uses.filter((u) => u.kind === 'aria' || u.kind === 'data').map((u) => u.attr),
          why: st.reason,
        });
      } else statusCount.behavior++;
      continue;
    }
    const onlyAttr = !hasClass && !kinds.includes('forward') && !p.viaRest;
    const cat = onlyAttr ? 'attrOnly' : st.depth > 0 ? 'drilled' : 'direct';
    if (cat === 'attrOnly') statusCount.attrOnly++;
    else if (cat === 'drilled') statusCount.styleOnlyDrilled++;
    else statusCount.styleOnlyDirect++;
    const cs = sites.get(comp) ?? [];
    const src = cs.filter((s) => s.kind === 'src');
    const passing = src.filter((s) => s.attrs.has(name));
    const spreadOnly = src.filter((s) => !s.attrs.has(name) && s.spreads.length);
    const stories = cs.filter((s) => s.kind !== 'src' && s.attrs.has(name));
    const vals = {};
    for (const s of passing) {
      const v = s.attrs.get(name).val;
      (vals[v] ??= []).push(s.at);
    }
    rows.push({
      comp: comp.name,
      at: `${comp.file}:${comp.line}`,
      prop: name,
      cat,
      type: p.type,
      def: p.def,
      cva: p.uses.some((u) => u.cva),
      kinds,
      depth: st.depth,
      chain: st.chain,
      uses: p.uses.map((u) => `${u.kind}${u.attr ? `:${u.attr}` : ''}${u.via ? `(via ${u.via})` : ''}@${u.at?.split(':').pop()}`),
      renders: src.length,
      passing: passing.length,
      spreadSites: spreadOnly.length,
      stories: stories.length,
      distinct: Object.keys(vals).length,
      vals,
      exported: !!comp.sym.exports || !!comp.sym.parent,
      viaRest: p.viaRest,
      hasClassName: comp.props.has('className'),
    });
  }
}
rows.sort((a, b) => a.at.localeCompare(b.at));
const scoped = rows.filter((row) => scope.get(row.at.split(':')[0]) !== 'identical');
writeFileSync(
  outFile,
  JSON.stringify(
    { statusCount, totalProps, components: [...components.values()].filter((c) => c.kind === 'src').length, rows: scoped, mixedLeads },
    null,
    1,
  ),
);
console.log({ components: components.size, totalProps, statusCount, rows: scoped.length, mixed: mixedLeads.length });
