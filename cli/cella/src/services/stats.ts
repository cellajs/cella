/**
 * Stats service for cella CLI.
 *
 * Counts files in the codebase using `git ls-files` (fast, respects .gitignore).
 * Categorizes by type and workspace package.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pc from '../utils/colors';
import { printCoverageSummary } from '../utils/coverage-utils';
import { createSpinner, DIVIDER, spinnerSuccess } from '../utils/display';
import { git } from '../utils/git';
import { parseYamlBlockList } from '../utils/yaml';

/** Extensions Biome can check (source code, config, styles) */
const sourceExtensions = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'jsonc', 'css', 'html']);

/** File category for classification */
type FileCategory = 'test' | 'generated' | 'json' | 'other';

/** Stats result for display or JSON output */
interface StatsResult {
  total: number;
  totalLoc: number;
  skipped: number;
  categories: Record<FileCategory, { files: number; loc: number }>;
  packages: Record<
    string,
    { total: number; loc: number; categories: Record<FileCategory, { files: number; loc: number }> }
  >;
}

/** Workspace package definition from pnpm-workspace.yaml */
interface WorkspacePackage {
  /** Display name (e.g., 'backend', 'cli/cella') */
  name: string;
  /** Path prefix to match (e.g., 'backend/', 'cli/cella/') */
  prefix: string;
}

/**
 * Parse pnpm-workspace.yaml to extract package paths.
 */
async function getWorkspacePackages(forkPath: string): Promise<WorkspacePackage[]> {
  const content = await readFile(join(forkPath, 'pnpm-workspace.yaml'), 'utf-8');

  return parseYamlBlockList(content, 'packages').map((pattern) => {
    // Handle wildcard patterns like 'cli/*' — resolved per file when matching
    if (pattern.endsWith('/*')) {
      const base = pattern.slice(0, -2);
      return { name: `${base}/*`, prefix: `${base}/` };
    }
    return { name: pattern, prefix: `${pattern}/` };
  });
}

/**
 * Classify a file path into a category.
 */
function classifyFile(filePath: string): FileCategory {
  // Test files
  if (
    filePath.includes('.test.') ||
    filePath.includes('.spec.') ||
    filePath.includes('/tests/') ||
    filePath.includes('/test/') ||
    filePath.startsWith('tests/') ||
    filePath.includes('/__tests__/')
  ) {
    return 'test';
  }

  // Generated files
  if (
    filePath.includes('.gen.') ||
    filePath.includes('.gen/') ||
    filePath.includes('/gen/') ||
    filePath.startsWith('drizzle/') ||
    filePath.includes('/drizzle/') ||
    filePath.endsWith('.d.ts') ||
    filePath.includes('.tsbuildinfo')
  ) {
    return 'generated';
  }

  // JSON
  if (filePath.endsWith('.json') || filePath.endsWith('.jsonc')) {
    return 'json';
  }

  return 'other';
}

/**
 * Match a file to its workspace package, handling wildcard patterns.
 */
function matchPackage(filePath: string, packages: WorkspacePackage[]): string {
  for (const pkg of packages) {
    if (pkg.name.endsWith('/*')) {
      // Wildcard: match any subfolder under the base prefix
      if (filePath.startsWith(pkg.prefix)) {
        // Extract the actual subpackage name (e.g., 'cli/cella' from 'cli/cella/src/foo.ts')
        const rest = filePath.slice(pkg.prefix.length);
        const subDir = rest.split('/')[0];
        if (subDir) {
          return `${pkg.prefix}${subDir}`;
        }
      }
    } else if (filePath.startsWith(pkg.prefix)) {
      return pkg.name;
    }
  }
  return '(root)';
}

/** Pathspec patterns for source extensions */
const sourcePathspecs = [...sourceExtensions].map((ext) => `*.${ext}`);

/**
 * Collect file stats from the repository.
 * Uses `git grep -c ''` to get file list + line counts in a single call.
 */
async function collectStats(forkPath: string): Promise<StatsResult> {
  // Get all tracked source files with line counts (respects .gitignore, ~15ms)
  const output = await git(['grep', '-c', '', '--', ...sourcePathspecs], forkPath, { ignoreErrors: true });
  const allFilesOutput = await git(['ls-files', '--cached'], forkPath);
  const allFilesCount = allFilesOutput.split('\n').filter(Boolean).length;

  const packages = await getWorkspacePackages(forkPath);

  // Parse "path:count" lines
  const entries: { path: string; loc: number }[] = [];
  for (const line of output.split('\n')) {
    if (!line) continue;
    const sep = line.lastIndexOf(':');
    if (sep === -1) continue;
    entries.push({ path: line.slice(0, sep), loc: Number.parseInt(line.slice(sep + 1), 10) });
  }

  const skipped = allFilesCount - entries.length;
  const emptyCat = () => ({
    test: { files: 0, loc: 0 },
    generated: { files: 0, loc: 0 },
    json: { files: 0, loc: 0 },
    other: { files: 0, loc: 0 },
  });
  const categories = emptyCat();
  const pkgStats = new Map<
    string,
    { total: number; loc: number; categories: Record<FileCategory, { files: number; loc: number }> }
  >();
  let totalLoc = 0;

  for (const { path, loc } of entries) {
    const category = classifyFile(path);
    categories[category].files++;
    categories[category].loc += loc;
    totalLoc += loc;

    const pkg = matchPackage(path, packages);
    let entry = pkgStats.get(pkg);
    if (!entry) {
      entry = { total: 0, loc: 0, categories: emptyCat() };
      pkgStats.set(pkg, entry);
    }
    entry.total++;
    entry.loc += loc;
    entry.categories[category].files++;
    entry.categories[category].loc += loc;
  }

  // Sort packages by source LOC descending
  const sortedPackages = Object.fromEntries(
    [...pkgStats.entries()].sort((a, b) => b[1].categories.other.loc - a[1].categories.other.loc),
  );

  return { total: entries.length, totalLoc, skipped, categories, packages: sortedPackages };
}

/**
 * Format a number with padding for table alignment.
 */
function pad(n: number, width = 6): string {
  return String(n).padStart(width);
}

/**
 * Format a number with K suffix for large values.
 */
function formatLoc(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/**
 * Format a LOC value for fixed-width table columns.
 */
function formatLocColumn(n: number, width = 8): string {
  return formatLoc(n).padStart(width);
}

/**
 * Format a percentage with fixed width (e.g., '05.0%', '89.7%').
 */
function fmtPct(value: number, total: number): string {
  const pct = ((value / total) * 100).toFixed(1);
  return `${pct.padStart(5)}%`;
}

/**
 * Print stats in table format.
 */
function printStats(stats: StatsResult, verbose: boolean): void {
  console.info();
  console.info(
    `  ${pc.bold('source files')}  ${String(stats.total)}  ${pc.dim(`(${stats.skipped} non-source skipped)`)}`,
  );
  console.info(`  ${pc.bold('lines of code')} ${pc.cyan(formatLoc(stats.totalLoc))}`);
  console.info();

  const catEntries: [string, { files: number; loc: number }][] = [
    ['source & config', stats.categories.other],
    ['test', stats.categories.test],
    ['generated', stats.categories.generated],
    ['json', stats.categories.json],
  ];
  for (const [label, data] of catEntries) {
    console.info(
      `  ${pad(data.files)} ${pc.dim(fmtPct(data.files, stats.total))}  ${label.padEnd(18)} ${pc.cyan(formatLocColumn(data.loc))}  ${pc.dim(fmtPct(data.loc, stats.totalLoc))}`,
    );
  }

  console.info();
  console.info(DIVIDER);
  console.info();

  if (verbose) {
    // Verbose: show per-package category breakdown
    const header = `  ${''.padEnd(6)}  ${'package'.padEnd(18)} ${'loc'.padStart(8)} ${'test'.padStart(6)} ${'gen'.padStart(6)} ${'json'.padStart(6)} ${'src'.padStart(6)}`;
    console.info(pc.dim(header));
    for (const [name, data] of Object.entries(stats.packages)) {
      const c = data.categories;
      const srcFiles = c.other.files;
      const srcLoc = c.other.loc;
      if (srcFiles === 0) continue;
      console.info(
        `  ${pc.dim(pad(srcFiles))}  ${name.padEnd(18)} ${pc.cyan(formatLocColumn(srcLoc))} ${pc.dim(pad(c.test.files))} ${pc.dim(pad(c.generated.files))} ${pc.dim(pad(c.json.files))} ${pc.dim(pad(srcFiles))}`,
      );
    }
  } else {
    for (const [name, data] of Object.entries(stats.packages)) {
      const srcFiles = data.categories.other.files;
      const srcLoc = data.categories.other.loc;
      if (srcFiles === 0) continue;
      console.info(
        `  ${pad(srcFiles)} ${pc.dim(fmtPct(srcFiles, stats.categories.other.files))}  ${name.padEnd(18)} ${pc.cyan(formatLocColumn(srcLoc))}  ${pc.dim(fmtPct(srcLoc, stats.categories.other.loc))}`,
      );
    }
  }

  console.info();
}

/**
 * Run the stats service.
 */
export async function runStats(
  forkPath: string,
  options: { json?: boolean; verbose?: boolean; refreshCoverage?: boolean } = {},
): Promise<void> {
  createSpinner('counting files...');
  const stats = await collectStats(forkPath);
  spinnerSuccess('Finished counting by raw line of code');

  if (options.json) {
    console.info(JSON.stringify(stats, null, 2));
  } else {
    printStats(stats, options.verbose ?? false);
    console.info();
    printCoverageSummary(forkPath, { refresh: options.refreshCoverage });
  }
}
