#!/usr/bin/env tsx
/**
 * Bench CLI — single-command orchestrator for Artillery load tests.
 *
 * Expects the app's services to be running already (`pnpm dev`) and Postgres
 * seeded with app data (`pnpm seed`). Verifies they are reachable, seeds bench
 * test data, clears rate limits, and runs the selected scenario.
 *
 * Usage:
 *   pnpm bench                                  # interactive picker
 *   pnpm bench attachment-edit                  # run a scenario directly
 *   pnpm bench attachment-edit --skip-seed      # skip bench data seeding
 *   pnpm bench help                             # list available scenarios
 *
 * The scenario name is a positional argument. The legacy `--scenario <name>`
 * flag is still accepted as an alias.
 *
 * Each run is automatically saved to .baselines/<scenario>.json and compared
 * against the previous run — no flag required.
 */

import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { select } from '@inquirer/prompts';
import ora from 'ora';
import pg from 'pg';
import { appConfig } from 'shared';
import pc from 'shared/cli-utils/colors';
import { printHeader } from 'shared/cli-utils/display';
import { BACKEND_PORT, BASE_URL, createBenchProcessEnv, DB_URL } from './config';

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const BENCH_ROOT = resolve(__dirname, '..');

// Only services the app actually runs are health-checked. yjs and ai are
// feature-flagged via appConfig.features, so they are skipped unless enabled.
const SERVICES = {
  backend: `${BASE_URL}/health`,
  cdc: `http://localhost:${BACKEND_PORT + 1}/health`,
  ...(appConfig.features.yjs ? { yjs: `http://localhost:${BACKEND_PORT + 2}/health` } : {}),
  ...(appConfig.features.ai ? { ai: `http://localhost:${BACKEND_PORT + 3}/health` } : {}),
} as const;

// ── CLI args ───────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let scenario: string | undefined;
  let skipSeed = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--scenario' && args[i + 1]) scenario = args[++i];
    else if (arg === '--skip-seed') skipSeed = true;
    else if (arg === 'help' || arg === '--help' || arg === '-h') help = true;
    // First bare (non-flag) argument is the scenario name.
    else if (!arg.startsWith('-') && scenario === undefined) scenario = arg;
  }

  return { scenario, skipSeed, help };
}

// ── Scenario discovery ─────────────────────────────────────────────────────

function discoverScenarios(): string[] {
  const dir = resolve(BENCH_ROOT, 'scenarios');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => basename(f, '.yaml'))
    .sort();
}

/**
 * Short description for a scenario, read from the first comment line of its YAML.
 * Keeps the picker in sync with whatever scenarios exist — no hardcoded map to
 * edit when a fork adds a scenario.
 */
function scenarioDescription(name: string): string {
  try {
    const content = readFileSync(resolve(BENCH_ROOT, 'scenarios', `${name}.yaml`), 'utf-8');
    const firstComment = content.split('\n').find((line) => line.trim().startsWith('#'));
    return firstComment ? firstComment.replace(/^\s*#+\s?/, '').trim() : '';
  } catch {
    return '';
  }
}

/** Print usage and the list of available scenarios (for `pnpm bench help`). */
function printUsage(scenarios: string[]): void {
  console.info(`${pc.bold('Usage:')} pnpm bench [scenario] [--skip-seed]\n`);
  console.info('Run without a scenario for an interactive picker.\n');
  console.info(pc.bold('Scenarios:'));
  for (const name of scenarios) {
    console.info(`  ${name.padEnd(22)}${pc.dim(scenarioDescription(name))}`);
  }
  console.info();
}

// ── Helpers ────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Preflight ──────────────────────────────────────────────────────────────

async function isPostgresReady(): Promise<boolean> {
  const pool = new pg.Pool({ connectionString: DB_URL, connectionTimeoutMillis: 2000 });
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

async function isServiceHealthy(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    return res.status === 204 || res.ok;
  } catch {
    return false;
  }
}

/**
 * Fail-fast preflight. Bench expects Postgres seeded with app data and the
 * backend/cdc services (plus yjs/ai when enabled) already running via `pnpm dev` — it does not start
 * them. Services are polled briefly to tolerate `dev` still compiling, then we
 * exit with an actionable message rather than hanging or producing empty runs.
 */
async function assertInfrastructureReady(): Promise<void> {
  const spinner = ora('checking infrastructure...').start();

  if (!(await isPostgresReady())) {
    spinner.fail('postgres is not reachable');
    const { hostname, port } = new URL(DB_URL);
    console.error(
      pc.dim(`  Expected Postgres at ${hostname}:${port}. Start it with \`pnpm docker\` and seed with \`pnpm seed\`.`),
    );
    process.exit(1);
  }

  const deadline = Date.now() + 15_000;
  for (const [name, url] of Object.entries(SERVICES)) {
    while (!(await isServiceHealthy(url))) {
      if (Date.now() >= deadline) {
        spinner.fail(`${name} is not reachable`);
        console.error(pc.dim(`  Expected ${name} at ${url}. Start services with \`pnpm dev\` first.`));
        process.exit(1);
      }
      spinner.text = `waiting for ${name}...`;
      await sleep(1000);
    }
  }

  spinner.succeed('infrastructure ready');
}

// ── Rate limits ────────────────────────────────────────────────────────────

async function clearRateLimits(): Promise<void> {
  const pool = new pg.Pool({ connectionString: DB_URL });
  try {
    await pool.query("DELETE FROM rate_limits WHERE key LIKE 'password_%'");
  } catch {
    // Table may not exist on first run
  } finally {
    await pool.end();
  }
}

// ── DB seed ────────────────────────────────────────────────────────────────

function seedDatabase(): Promise<{ output: string }> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const child = spawn('tsx', ['src/data-setup.ts'], {
      cwd: BENCH_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (data: Buffer) => chunks.push(data.toString()));
    child.stderr?.on('data', (data: Buffer) => chunks.push(data.toString()));
    child.on('close', (code) =>
      code === 0
        ? resolve({ output: chunks.join('') })
        : reject(new Error(`db:seed exited with code ${code}\n${chunks.join('')}`)),
    );
    child.on('error', reject);
  });
}

// ── Artillery ──────────────────────────────────────────────────────────────

function runArtillery(name: string): { exitCode: number; reportPath: string } {
  const reportPath = resolve(tmpdir(), `artillery-${name}-${Date.now()}.json`);
  try {
    execFileSync('npx', ['artillery', 'run', `scenarios/${name}.yaml`, '--output', reportPath], {
      cwd: BENCH_ROOT,
      stdio: 'inherit',
      env: createBenchProcessEnv(),
    });
    return { exitCode: 0, reportPath };
  } catch (err) {
    const code = (err as { status?: number }).status ?? 1;
    // Artillery exits 1 when ensure checks fail — the report is already printed above
    console.error(`\n${pc.red('✗')} artillery exited with code ${code}`);
    return { exitCode: code, reportPath };
  }
}

/**
 * Background CDC health poller.
 *
 * Runs automatically for every scenario — no flag, no developer awareness. It
 * collects throughput/latency samples silently (`--quiet`) and only emits a
 * summary if CDC actually processed events, so read-only scenarios stay clean.
 * A separate process is required because `runArtillery` blocks the event loop
 * via synchronous `execFileSync`. Returns the process and a promise resolving to
 * the collected summary output once the poller has flushed and exited.
 */
function startCdcPoller(): { proc: ChildProcess; summary: Promise<string> } {
  const proc = spawn('tsx', ['src/cdc-poller.ts', '--quiet'], {
    cwd: BENCH_ROOT,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const chunks: string[] = [];
  proc.stdout?.on('data', (data: Buffer) => chunks.push(data.toString()));
  const summary = new Promise<string>((res) => proc.on('close', () => res(chunks.join(''))));
  return { proc, summary };
}

// ── Baselines ──────────────────────────────────────────────────────────────

const BASELINES_DIR = resolve(BENCH_ROOT, '.baselines');

interface BaselineMetrics {
  timestamp: string;
  scenario: string;
  requests: number;
  requestRate: number;
  mean: number;
  p95: number;
  p99: number;
  errors: number;
  vusersCreated: number;
  vusersFailed: number;
}

function extractMetrics(reportPath: string, scenario: string): BaselineMetrics | null {
  try {
    const raw = JSON.parse(readFileSync(reportPath, 'utf-8'));
    const agg = raw.aggregate;
    if (!agg) return null;

    const counters = agg.counters ?? {};
    const rt = agg.summaries?.['http.response_time'] ?? agg.histograms?.['http.response_time'] ?? {};
    const rates = agg.rates ?? {};

    const errorKeys = Object.keys(counters).filter((k) => k.startsWith('errors.'));
    const totalErrors = errorKeys.reduce((sum, k) => sum + (counters[k] ?? 0), 0);

    return {
      timestamp: new Date().toISOString(),
      scenario,
      requests: counters['http.requests'] ?? 0,
      requestRate: rates['http.request_rate'] ?? 0,
      mean: rt.mean ?? 0,
      p95: rt.p95 ?? 0,
      p99: rt.p99 ?? 0,
      errors: totalErrors,
      vusersCreated: counters['vusers.created'] ?? 0,
      vusersFailed: counters['vusers.failed'] ?? 0,
    };
  } catch {
    return null;
  }
}

function loadBaseline(scenario: string): BaselineMetrics | null {
  const file = resolve(BASELINES_DIR, `${scenario}.json`);
  if (!existsSync(file)) return null;
  try {
    const data = JSON.parse(readFileSync(file, 'utf-8'));
    // Support both old single-object and new array format
    const runs: BaselineMetrics[] = Array.isArray(data) ? data : [data];
    return runs.at(-1) ?? null;
  } catch {
    return null;
  }
}

function saveBaseline(metrics: BaselineMetrics): void {
  mkdirSync(BASELINES_DIR, { recursive: true });
  const file = resolve(BASELINES_DIR, `${metrics.scenario}.json`);

  let runs: BaselineMetrics[] = [];
  if (existsSync(file)) {
    try {
      const data = JSON.parse(readFileSync(file, 'utf-8'));
      runs = Array.isArray(data) ? data : [data];
    } catch {
      // Corrupt file — start fresh
    }
  }

  runs.push(metrics);
  writeFileSync(file, `${JSON.stringify(runs, null, 2)}\n`);

  const count = runs.length;
  console.info(
    `\n${pc.green('✓')} baseline saved → ${pc.dim(`.baselines/${metrics.scenario}.json`)} ${pc.dim(`(${count} run${count === 1 ? '' : 's'})`)}`,
  );
}

function formatDelta(current: number, baseline: number, lowerIsBetter: boolean): string {
  if (baseline === 0) return '';
  const pct = ((current - baseline) / baseline) * 100;
  if (Math.abs(pct) < 1) return pc.dim('  ~0%');
  const sign = pct > 0 ? '+' : '';
  const label = `${sign}${pct.toFixed(0)}%`;
  const better = lowerIsBetter ? pct < 0 : pct > 0;
  return better ? pc.green(label) : pct === 0 ? pc.dim(label) : pc.red(label);
}

function printComparison(current: BaselineMetrics, baseline: BaselineMetrics | null): void {
  const rows: [string, string, string, string][] = [
    [
      'Requests',
      String(current.requests),
      baseline ? String(baseline.requests) : '-',
      baseline ? formatDelta(current.requests, baseline.requests, false) : '',
    ],
    [
      'Req/s',
      String(current.requestRate),
      baseline ? String(baseline.requestRate) : '-',
      baseline ? formatDelta(current.requestRate, baseline.requestRate, false) : '',
    ],
    [
      'Mean (ms)',
      String(current.mean),
      baseline ? String(baseline.mean) : '-',
      baseline ? formatDelta(current.mean, baseline.mean, true) : '',
    ],
    [
      'p95 (ms)',
      String(current.p95),
      baseline ? String(baseline.p95) : '-',
      baseline ? formatDelta(current.p95, baseline.p95, true) : '',
    ],
    [
      'p99 (ms)',
      String(current.p99),
      baseline ? String(baseline.p99) : '-',
      baseline ? formatDelta(current.p99, baseline.p99, true) : '',
    ],
    ['Errors', String(current.errors), baseline ? String(baseline.errors) : '-', ''],
    ['VUs failed', String(current.vusersFailed), baseline ? String(baseline.vusersFailed) : '-', ''],
  ];

  const header = baseline
    ? `\n  ${pc.bold('Metric'.padEnd(14))} ${pc.bold('Current'.padStart(10))} ${pc.bold('Baseline'.padStart(10))} ${pc.bold('Delta'.padStart(8))}`
    : `\n  ${pc.bold('Metric'.padEnd(14))} ${pc.bold('Current'.padStart(10))}`;

  console.info(header);
  console.info(`  ${'─'.repeat(baseline ? 46 : 26)}`);

  for (const [label, cur, base, delta] of rows) {
    const line = baseline
      ? `  ${label.padEnd(14)} ${cur.padStart(10)} ${base.padStart(10)} ${delta.padStart(8)}`
      : `  ${label.padEnd(14)} ${cur.padStart(10)}`;
    console.info(line);
  }

  if (!baseline) {
    console.info(`\n  ${pc.dim('No previous run to compare against — saving this run as the first baseline.')}`);
  } else {
    console.info(`  ${pc.dim(`baseline from ${baseline.timestamp}`)}`);
  }
  console.info();
}

// ── Cleanup ────────────────────────────────────────────────────────────────

const cleanupFns: (() => void)[] = [];

function registerCleanup(fn: () => void) {
  cleanupFns.push(fn);
}

function cleanup() {
  for (const fn of cleanupFns) {
    try {
      fn();
    } catch {}
  }
  cleanupFns.length = 0;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });

  printHeader('bench cli');

  const scenarios = discoverScenarios();
  const { scenario: cliScenario, skipSeed, help } = parseArgs();

  if (scenarios.length === 0) {
    console.error(pc.red('No scenarios found in scenarios/'));
    process.exit(1);
  }

  if (help) {
    printUsage(scenarios);
    process.exit(0);
  }

  if (cliScenario && !scenarios.includes(cliScenario)) {
    console.error(pc.red(`Unknown scenario: ${cliScenario}`));
    console.error(pc.dim(`Available: ${scenarios.join(', ')}`));
    process.exit(1);
  }

  // ── 1. Infrastructure ──

  await assertInfrastructureReady();

  // ── 2. Scenario selection ──

  // When using --scenario, seed in parallel (no TUI to conflict with).
  // In interactive mode, seed after selection to avoid spinner corrupting the prompt.
  let seedPromise: Promise<void> | undefined;
  if (!skipSeed && cliScenario) {
    const seedSpinner = ora('seeding database...').start();
    seedPromise = seedDatabase()
      .then(() => {
        seedSpinner.succeed('database ready');
      })
      .catch((err: Error) => {
        seedSpinner.fail('database seed failed');
        console.error(err.message);
        cleanup();
        process.exit(1);
      });
  }

  let selected: string;

  if (cliScenario) {
    selected = cliScenario;
  } else {
    const choices = [
      ...scenarios.map((name) => ({
        value: name,
        name: `${name.padEnd(22)}${pc.dim(scenarioDescription(name))}`,
      })),
      { type: 'separator' as const, separator: '─'.repeat(40) },
      { value: 'exit', name: pc.red(`exit${' '.repeat(18)}${pc.dim('quit without running')}`) },
    ];

    selected = await select({ message: 'select scenario', choices });

    if (selected === 'exit') {
      console.info(pc.dim('\nexited.'));
      cleanup();
      process.exit(0);
    }
  }

  // Seed after interactive selection (safe — no TUI active)
  if (!skipSeed && !seedPromise) {
    const seedSpinner = ora('seeding database...').start();
    seedPromise = seedDatabase()
      .then(() => {
        seedSpinner.succeed('database ready');
      })
      .catch((err: Error) => {
        seedSpinner.fail('database seed failed');
        console.error(err.message);
        cleanup();
        process.exit(1);
      });
  }

  if (seedPromise) await seedPromise;

  // ── 3. Clear rate limits ──

  await clearRateLimits();

  // ── 4. CDC poller ──

  // Always runs in the background, silently. Stays invisible unless CDC actually
  // processed events during the run — no flag, no developer awareness needed.
  const cdcPoller = startCdcPoller();
  registerCleanup(() => cdcPoller.proc.kill('SIGINT'));

  // ── 5. Run Artillery ──

  console.info(`${pc.cyan('▸')} running ${pc.bold(selected)}...\n`);
  let artilleryExitCode = 0;
  try {
    const { exitCode, reportPath } = runArtillery(selected);
    artilleryExitCode = exitCode;

    // Stop the poller and flush its summary (printed only if CDC saw events).
    cdcPoller.proc.kill('SIGINT');
    const cdcSummary = (await cdcPoller.summary).trimEnd();
    if (cdcSummary) console.info(cdcSummary);

    // ── 6. Baseline comparison ──
    const metrics = extractMetrics(reportPath, selected);
    if (metrics) {
      const baseline = loadBaseline(selected);
      printComparison(metrics, baseline);
      saveBaseline(metrics);
    }
  } finally {
    cleanup();
  }

  if (artilleryExitCode !== 0) process.exit(artilleryExitCode);
}

main().catch((err) => {
  console.error(pc.red('bench failed:'), err);
  cleanup();
  process.exit(1);
});
