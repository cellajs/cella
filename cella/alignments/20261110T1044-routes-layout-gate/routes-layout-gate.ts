/**
 * Codemod: the `_app` layout gates sign-in, and the router's defaults render errors, not-founds and pending loads.
 *
 * `rewrite` changes what reads the same in every app:
 *   staticData.isAuth                              -> gone; a `staticData` left empty goes with it
 *   requireEntityAction(a, b, c, '<path>')         -> requireEntityAction(a, b, c): the guard derives the channel's page
 *   '/_public/_content/…' route ids                -> '/_public/…'
 *   SpinnerPage from ~/routes/-route-utils         -> PageSpinner from ~/modules/common/spinner
 *   withSuspense* from ~/routes/-route-utils       -> ~/modules/common/with-suspense
 *   BoundaryType from ~/routes/types               -> ~/lib/boundary
 *   errorComponent: createErrorComponent(…)        -> gone, with an import that named nothing else
 * `inventory` lists those and what needs judgment, which no mode rewrites:
 *   notFoundComponent: createNotFoundComponent(…)  -> RouteNotFoundComponent where the route's loader or page throws notFound(), else gone
 *   createErrorComponent outside a route option    -> wrap RouteErrorComponent from ~/routes/-route-utils
 *   pendingComponent on a redirect-only route      -> gone, with its local spinner: the router's default shows
 *   onEnter that navigates                         -> a beforeLoad that throws redirect
 *   import('~/routes/router')                      -> getRouter() from ~/routes/-router-instance
 *   a beforeLoad in __root.tsx                     -> its hook moves into requireSession (modules/auth/route-logic.ts)
 *   a route file under routes/_public/_content/    -> git mv to routes/_public/
 *
 * Usage (from the repo root):
 *   pnpm exec tsx cella/alignments/<id>/routes-layout-gate.ts inventory frontend/src
 *   pnpm exec tsx cella/alignments/<id>/routes-layout-gate.ts rewrite   frontend/src
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, sep } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', 'gen']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (['.ts', '.tsx'].includes(extname(name)) && !name.endsWith('.gen.ts')) out.push(path);
  }
  return out;
}

const rewrites: { name: string; pattern: RegExp; replacement: string }[] = [
  { name: 'isAuth before another entry', pattern: /isAuth: (?:true|false),\s*/g, replacement: '' },
  { name: 'isAuth after another entry', pattern: /,\s*isAuth: (?:true|false)(?=\s*\})/g, replacement: '' },
  { name: 'isAuth alone', pattern: /isAuth: (?:true|false)(?=\s*\})/g, replacement: '' },
  { name: 'empty staticData', pattern: /\n?\s*staticData: \{\s*\},?/g, replacement: '' },
  { name: 'requireEntityAction redirect path', pattern: /(requireEntityAction\((?:[^()]|\([^()]*\))*?),\s*'[^']*'\)/g, replacement: '$1)' },
  { name: 'docs route id', pattern: /'\/_public\/_content\//g, replacement: "'/_public/" },
  { name: 'SpinnerPage import', pattern: /import \{ SpinnerPage \} from '~\/routes\/-route-utils';/g, replacement: "import { PageSpinner } from '~/modules/common/spinner';" },
  { name: 'SpinnerPage use', pattern: /\bSpinnerPage\b/g, replacement: 'PageSpinner' },
  {
    name: 'withSuspense import',
    pattern: /import \{ (withSuspense(?:Spinner)?(?:, withSuspense(?:Spinner)?)?) \} from '~\/routes\/-route-utils';/g,
    replacement: "import { $1 } from '~/modules/common/with-suspense';",
  },
  { name: 'BoundaryType import', pattern: /from '~\/routes\/types'/g, replacement: "from '~/lib/boundary'" },
  { name: 'errorComponent option', pattern: /\n\s*errorComponent: createErrorComponent\([^)]*\),/g, replacement: '' },
  { name: 'createErrorComponent import', pattern: /import \{ createErrorComponent \} from '~\/routes\/-route-utils';\n/g, replacement: '' },
];

const judgments: { pattern: RegExp; hint: string }[] = [
  { pattern: /createNotFoundComponent\(/, hint: 'notFoundComponent: RouteNotFoundComponent when this route throws notFound(), else drop the option' },
  { pattern: /(?<!errorComponent: )createErrorComponent\(/, hint: 'wrap RouteErrorComponent from ~/routes/-route-utils' },
  { pattern: /pendingComponent:/, hint: 'drop it and its local spinner: the router renders PageSpinner while the route loads' },
  { pattern: /onEnter:/, hint: 'a beforeLoad that throws redirect, in the module\'s route-logic.ts' },
  { pattern: /import\('~\/routes\/router'\)/, hint: 'getRouter() from ~/routes/-router-instance' },
];

const [mode = 'inventory', ...roots] = process.argv.slice(2);
if (mode !== 'inventory' && mode !== 'rewrite') {
  console.error(`unknown mode '${mode}': inventory or rewrite`);
  process.exit(1);
}
const files = (roots.length ? roots : ['frontend/src']).flatMap((root) => walk(root));
let changedFiles = 0;
let hits = 0;

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  let next = source;
  for (const { name, pattern, replacement } of rewrites) {
    // An empty staticData goes only where an isAuth left it: a test fake's stays
    if (name === 'empty staticData' && next === source) continue;
    const matches = next.match(pattern)?.length ?? 0;
    if (!matches) continue;
    hits += matches;
    if (mode === 'inventory') console.info(`${file}: ${matches} × ${name}`);
    next = next.replace(pattern, replacement);
  }
  if (mode === 'rewrite' && next !== source) {
    writeFileSync(file, next);
    changedFiles++;
  }

  const lines = source.split('\n');
  lines.forEach((line, index) => {
    for (const { pattern, hint } of judgments) if (pattern.test(line)) console.info(`${file}:${index + 1}: ${hint}`);
  });
  if (file.endsWith(`${sep}__root.tsx`) && /beforeLoad/.test(source)) console.info(`${file}: the root beforeLoad is gone; a hook of the app moves into requireSession`);
  if (file.includes(`${sep}routes${sep}_public${sep}_content${sep}`)) console.info(`${file}: git mv to routes/_public/ (the _content layout is gone)`);
}

console.info(mode === 'rewrite' ? `rewrote ${changedFiles} file(s)` : `${hits} rewrite(s) over ${files.length} file(s); run with 'rewrite' to apply`);
