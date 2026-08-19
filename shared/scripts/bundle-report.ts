/** Shipped-bundle size report over a built frontend/dist; `pnpm deps:bundle`. @see README.md */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const distDir = join(repoRoot, 'frontend', 'dist');

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
};
const topCount = Number(option('top') ?? 12);
const jsonPath = option('json');
const maxCriticalKb = option('max-critical-kb');
const assertLazy = flag('assert-lazy');

type Asset = { path: string; raw: number; gzip: number; brotli: number };

function walk(dir: string, into: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, into);
    else if (entry.isFile()) into.push(full);
  }
  return into;
}

/** Source maps are served for debugging but no browser downloads them on a page view. */
const isShipped = (file: string) => !file.endsWith('.map');

function measure(file: string): Asset {
  const bytes = readFileSync(file);
  return {
    path: relative(distDir, file),
    raw: bytes.length,
    gzip: gzipSync(bytes).length,
    brotli: brotliCompressSync(bytes).length,
  };
}

/** Static ESM edges only: `import x from "y"`, `import "y"`, `export * from "y"`. */
const STATIC_EDGE = /(?:^|[;}\s])(?:import|export)(?:[^"';]*?\bfrom)?\s*["']([^"']+)["']/g;

/** Relative specifiers another chunk pulls in eagerly, resolved to dist-relative paths. */
function staticEdges(assetPath: string): string[] {
  let source: string;
  try {
    source = readFileSync(join(distDir, assetPath), 'utf8');
  } catch {
    return [];
  }
  const edges = new Set<string>();
  for (const match of source.matchAll(STATIC_EDGE)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;
    edges.add(normalize(join(dirname(assetPath), specifier)));
  }
  return [...edges];
}

/**
 * Every chunk reachable from the entry script through static imports. A browser must fetch, parse and
 * evaluate all of them before the entry module body runs, so this is the real cost of a cold start.
 * `modulepreload` links are only a hint and can name fewer or more chunks than this set.
 */
function criticalPaths(): string[] {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8');
  const entries = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1].replace(/^\//, ''));
  const reached = new Set<string>();
  const pending = [...entries];
  while (pending.length) {
    const asset = pending.pop();
    if (!asset || reached.has(asset)) continue;
    reached.add(asset);
    for (const edge of staticEdges(asset)) if (!reached.has(edge)) pending.push(edge);
  }
  return [...reached];
}

/** Chunks the HTML preloads, to flag drift between the hint and the graph that actually blocks boot. */
function preloadedPaths(): string[] {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8');
  return [...html.matchAll(/rel="modulepreload"[^>]*\bhref="([^"]+)"/g)].map((m) => m[1].replace(/^\//, ''));
}

/**
 * Packages belonging to a feature the app reaches on demand, tracking FEATURE_LIBS in
 * `frontend/vite.config.ts`. Kept as a separate list on purpose: it states the intended outcome, so
 * it still fails when the chunking config is the thing that is wrong.
 *
 * Chunk grouping decides which chunk a
 * module lands in, and a group also captures its modules' dependencies, so one of these can end up
 * inside a boot chunk without any code importing it eagerly. Reading the source maps is the only way
 * to see that, because by then the package name is gone from the bundled output.
 */
const LAZY_ONLY: RegExp[] = [
  /[\\/]@blocknote[\\/]/,
  /[\\/]@tiptap[\\/]/,
  /[\\/]prosemirror-[\w-]+[\\/]/,
  /[\\/]@uppy[\\/]/,
  /[\\/]pdfjs-dist[\\/]/,
  /[\\/]react-pdf[\\/]/,
  /[\\/]media-chrome[\\/]/,
  /[\\/]gleap[\\/]/,
  /[\\/]@shikijs[\\/](langs|themes|engine-oniguruma)[\\/]/,
  /[\\/]react-scan[\\/]/,
];

/** Feature packages found inside a boot chunk, as `chunk -> package` pairs. */
function lazyOnlyInCritical(criticalAssets: Asset[]): { chunk: string; pkg: string }[] {
  const found = new Map<string, Set<string>>();
  for (const asset of criticalAssets) {
    if (!asset.path.endsWith('.js')) continue;
    let sources: string[];
    try {
      sources = JSON.parse(readFileSync(join(distDir, `${asset.path}.map`), 'utf8')).sources ?? [];
    } catch {
      continue;
    }
    for (const source of sources) {
      if (!LAZY_ONLY.some((pattern) => pattern.test(source))) continue;
      const tail = source.split('node_modules/').pop() ?? source;
      const pkg = tail.match(/^((?:@[^/]+\/)?[^/]+)/)?.[1];
      if (!pkg) continue;
      const chunk = asset.path.replace(/^assets\//, '').replace(/-[^-]+\.js$/, '');
      (found.get(chunk) ?? found.set(chunk, new Set()).get(chunk))?.add(pkg);
    }
  }
  return [...found].flatMap(([chunk, pkgs]) => [...pkgs].map((pkg) => ({ chunk, pkg })));
}

const entryHtml = readFileSync(join(distDir, 'index.html'), 'utf8');
const entryScript = (assetPath: string) => entryHtml.includes(`src="/${assetPath}"`);

const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} kB`;
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const pad = (value: string | number, width: number) => String(value).padEnd(width);
const padStart = (value: string | number, width: number) => String(value).padStart(width);

function main() {
  try {
    statSync(join(distDir, 'index.html'));
  } catch {
    console.error('No build found at frontend/dist. Run `pnpm --filter frontend build` first.');
    process.exit(1);
  }

  const assets = walk(distDir).filter(isShipped).map(measure);
  const sum = (list: Asset[], key: 'raw' | 'gzip' | 'brotli') => list.reduce((total, a) => total + a[key], 0);

  const byExtension = new Map<string, Asset[]>();
  for (const asset of assets) {
    const ext = extname(asset.path).slice(1) || '(none)';
    byExtension.set(ext, [...(byExtension.get(ext) ?? []), asset]);
  }

  const critical = new Set(criticalPaths());
  const criticalAssets = assets.filter((a) => critical.has(a.path));
  const lazyJs = assets.filter((a) => a.path.endsWith('.js') && !critical.has(a.path));

  console.log('\nShipped bundle (frontend/dist, source maps excluded)\n');
  console.log(
    `  ${assets.length} files    raw ${mb(sum(assets, 'raw'))}    gzip ${mb(sum(assets, 'gzip'))}    brotli ${mb(sum(assets, 'brotli'))}`,
  );

  console.log('\nBy type\n');
  console.log(`${pad('type', 10)}${padStart('files', 7)}${padStart('raw', 12)}${padStart('brotli', 12)}`);
  console.log('─'.repeat(41));
  for (const [ext, list] of [...byExtension].sort((a, b) => sum(b[1], 'brotli') - sum(a[1], 'brotli'))) {
    console.log(
      pad(ext, 10) +
        padStart(list.length, 7) +
        padStart(mb(sum(list, 'raw')), 12) +
        padStart(mb(sum(list, 'brotli')), 12),
    );
  }

  console.log('\nCritical path — chunks statically reachable from the entry, fetched and evaluated before boot\n');
  console.log(
    `  ${criticalAssets.length} chunks    raw ${mb(sum(criticalAssets, 'raw'))}    brotli ${mb(sum(criticalAssets, 'brotli'))}`,
  );
  console.log(`  lazy JS not on the critical path: ${lazyJs.length} chunks, brotli ${mb(sum(lazyJs, 'brotli'))}`);

  // A preload hint naming a chunk the static graph does not contain (or missing one it does) means the
  // two have drifted, and the headline number no longer matches what the browser actually does first.
  const preloaded = new Set(preloadedPaths());
  const hintOnly = [...preloaded].filter((p) => !critical.has(p));
  const graphOnly = [...critical].filter((p) => p.endsWith('.js') && !preloaded.has(p) && !entryScript(p));
  if (hintOnly.length || graphOnly.length) {
    console.log(`  preload drift: ${hintOnly.length} hinted but not static, ${graphOnly.length} static but not hinted`);
  }

  console.log('\nHeaviest critical-path chunks (brotli, cumulative)\n');
  let cumulative = 0;
  for (const asset of criticalAssets.sort((a, b) => b.brotli - a.brotli).slice(0, topCount)) {
    cumulative += asset.brotli;
    console.log(`  ${pad(asset.path, 48)}${padStart(kb(asset.brotli), 9)}${padStart(`cum ${kb(cumulative)}`, 14)}`);
  }

  if (jsonPath) {
    writeFileSync(
      jsonPath,
      `${JSON.stringify(
        {
          files: assets.length,
          raw: sum(assets, 'raw'),
          gzip: sum(assets, 'gzip'),
          brotli: sum(assets, 'brotli'),
          criticalChunks: criticalAssets.length,
          criticalBrotli: sum(criticalAssets, 'brotli'),
          lazyBrotli: sum(lazyJs, 'brotli'),
          heaviestCritical: criticalAssets.slice(0, topCount).map(({ path, raw, brotli }) => ({ path, raw, brotli })),
        },
        null,
        2,
      )}\n`,
    );
    console.log(`\nSnapshot written to ${jsonPath}`);
  }

  const leaked = lazyOnlyInCritical(criticalAssets);
  if (leaked.length) {
    const byChunk = new Map<string, string[]>();
    for (const { chunk, pkg } of leaked) byChunk.set(chunk, [...(byChunk.get(chunk) ?? []), pkg]);
    console.log(`\nOn-demand packages reachable before boot (${leaked.length})\n`);
    for (const [chunk, pkgs] of byChunk) {
      console.log(
        `  ${pad(chunk, 20)}${pkgs.slice(0, 6).join(', ')}${pkgs.length > 6 ? `, +${pkgs.length - 6} more` : ''}`,
      );
    }
  }

  if (maxCriticalKb) {
    const actual = sum(criticalAssets, 'brotli') / 1024;
    const budget = Number(maxCriticalKb);
    if (actual > budget) {
      console.error(`\nCritical path ${kb(sum(criticalAssets, 'brotli'))} exceeds the ${budget} kB budget.`);
      process.exit(1);
    }
    console.log(`\nCritical path within budget (${actual.toFixed(0)} of ${budget} kB).`);
  }

  if (assertLazy && leaked.length) {
    console.error(`\n${leaked.length} on-demand package(s) are reachable before boot; see the list above.`);
    process.exit(1);
  }
}

main();
