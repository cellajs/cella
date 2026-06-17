/**
 * Coverage utilities for the Cella CLI audit service.
 *
 * Reads the cached `coverage/coverage-summary.json` produced by the
 * `json-summary` Vitest reporter (see root vitest.config.ts) and renders a
 * compact overview. The audit service never runs tests itself — it only reads
 * the artifact from the last default `pnpm test` run, warning when it is stale
 * or missing.
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import pc from './colors';

/** A single metric block from a coverage-summary.json entry. */
interface CoverageMetric {
  total: number;
  covered: number;
  skipped: number;
  pct: number;
}

/** One file (or the `total`) entry in coverage-summary.json. */
interface CoverageEntry {
  lines: CoverageMetric;
  statements: CoverageMetric;
  functions: CoverageMetric;
  branches: CoverageMetric;
}

/** Shape of Vitest's coverage-summary.json. Keys are absolute file paths plus `total`. */
type CoverageSummary = Record<string, CoverageEntry> & { total: CoverageEntry };

/** Coverage data is considered stale after this many ms (7 days). */
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

/** Path to the cached summary written by the `json-summary` reporter. */
function summaryPath(forkPath: string): string {
  return path.join(forkPath, 'coverage', 'coverage-summary.json');
}

/** Color a percentage: green ≥ 80, yellow ≥ 50, red below. */
function colorPct(pct: number): string {
  const label = `${pct.toFixed(2)}%`;
  if (pct >= 80) return pc.green(label);
  if (pct >= 50) return pc.yellow(label);
  return pc.red(label);
}

/** Human-friendly "x days/hours ago" from a timestamp. */
function formatAge(ms: number): string {
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} ago`;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const mins = Math.floor(ms / (60 * 1000));
  return `${mins} minute${mins === 1 ? '' : 's'} ago`;
}

/**
 * Re-run the full coverage suite via `pnpm test`. Output is streamed so the
 * user sees progress (Docker boot, test run, etc.). Returns true on success.
 */
export function refreshCoverage(forkPath: string): boolean {
  console.info(pc.dim('running `pnpm test` (this spins up Docker and runs the full suite)...'));
  const result = spawnSync('pnpm', ['test'], { cwd: forkPath, stdio: 'inherit' });
  return result.status === 0;
}

/**
 * Print a compact coverage overview from the cached summary file.
 *
 * @param forkPath - Repository root.
 * @param options.refresh - When true, run `pnpm test` first to regenerate
 *   the cache before rendering.
 */
export function printCoverageSummary(forkPath: string, options: { refresh?: boolean } = {}): void {
  const file = summaryPath(forkPath);

  if (options.refresh) {
    const ok = refreshCoverage(forkPath);
    if (!ok) {
      console.info(pc.red('coverage run failed — showing last cached results (if any)'));
    }
    console.info();
  }

  if (!fs.existsSync(file)) {
    console.info(pc.bold('coverage'));
    console.info(pc.yellow('  no coverage data found — run `pnpm test` to generate it'));
    console.info();
    return;
  }

  let summary: CoverageSummary;
  let mtimeMs: number;
  try {
    summary = JSON.parse(fs.readFileSync(file, 'utf-8')) as CoverageSummary;
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    console.info(pc.bold('coverage'));
    console.info(pc.yellow('  could not read coverage-summary.json — run `pnpm test` to regenerate'));
    console.info();
    return;
  }

  const ageMs = Date.now() - mtimeMs;
  const stale = ageMs > STALE_THRESHOLD_MS;

  // Roll up per-package line coverage by the first path segment relative to root.
  const perPackage = new Map<string, { covered: number; total: number }>();
  for (const [key, entry] of Object.entries(summary)) {
    if (key === 'total') continue;
    const rel = path.relative(forkPath, key);
    if (rel.startsWith('..')) continue;
    const pkg = rel.split(path.sep)[0];
    const acc = perPackage.get(pkg) ?? { covered: 0, total: 0 };
    acc.covered += entry.lines.covered;
    acc.total += entry.lines.total;
    perPackage.set(pkg, acc);
  }

  // Header with freshness indicator.
  const ageLabel = formatAge(ageMs);
  console.info(pc.bold('coverage'), pc.dim(`(updated ${ageLabel})`));
  if (stale) {
    console.info(pc.yellow('  ⚠ data is older than 7 days — run `pnpm test` to refresh'));
  }

  // Overall totals.
  const total = summary.total;
  console.info(
    `  ${pc.bold('overall')}  ` +
      `lines ${colorPct(total.lines.pct)} ${pc.dim(`(${total.lines.covered}/${total.lines.total})`)}  ` +
      `funcs ${colorPct(total.functions.pct)}  ` +
      `branches ${colorPct(total.branches.pct)}`,
  );

  // Per-package line coverage, worst first.
  const rows = [...perPackage.entries()]
    .map(([pkg, v]) => ({ pkg, pct: v.total ? (100 * v.covered) / v.total : 0, ...v }))
    .sort((a, b) => a.pct - b.pct);

  const nameWidth = Math.max(...rows.map((r) => r.pkg.length), 0);
  for (const r of rows) {
    console.info(`    ${r.pkg.padEnd(nameWidth)}  ${colorPct(r.pct)} ${pc.dim(`(${r.covered}/${r.total})`)}`);
  }
  console.info();
}
