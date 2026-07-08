#!/usr/bin/env tsx
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { select } from '@inquirer/prompts';
import ora from 'ora';
import pg from 'pg';
import { pc } from 'shared/cli-utils/colors';
import { printHeader } from 'shared/cli-utils/display';
import { createBenchProcessEnv, DB_URL } from './config';
import { isPostgresReady, isServiceHealthy, SERVICES } from './preflight';

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const BENCH_ROOT = resolve(__dirname, '..');

/** Cooldown between scenarios in `--all` mode so load settles between runs. */
const PAUSE_SECONDS = 5;

// ── CLI args ───────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let scenario: string | undefined;
  let skipSeed = false;
  let all = false;
  let short = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    // `--scenario <name>` is a legacy alias for the positional argument below.
    if (arg === '--scenario' && args[i + 1]) scenario = args[++i];
    else if (arg === '--skip-seed') skipSeed = true;
    else if (arg === '--all') all = true;
    else if (arg === '--short') short = true;
    else if (arg === 'help' || arg === '--help' || arg === '-h') help = true;
    // First bare (non-flag) argument is the scenario name.
    else if (!arg.startsWith('-') && scenario === undefined) scenario = arg;
  }

  return { scenario, skipSeed, all, short, help };
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
 * Keeps the picker in sync with whatever scenarios exist, no hardcoded map to
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
  console.info(`${pc.bold('Usage:')} pnpm bench [scenario] [--all] [--short] [--skip-seed]\n`);
  console.info('Run without a scenario for an interactive picker.\n');
  console.info(pc.bold('Flags:'));
  console.info(`  ${'--all'.padEnd(22)}${pc.dim('run every scenario in sequence (quiet, prints a final summary)')}`);
  console.info(`  ${'--short'.padEnd(22)}${pc.dim('quick smoke run (1s/1VU, no thresholds, no baselines)')}`);
  console.info(`  ${'--skip-seed'.padEnd(22)}${pc.dim('skip bench data seeding')}\n`);
  console.info(pc.bold('Scenarios:'));
  for (const name of scenarios) {
    console.info(`  ${name.padEnd(22)}${pc.dim(scenarioDescription(name))}`);
  }
  console.info();
}

// ── Helpers ────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Preflight ──────────────────────────────────────────────────────────────

/**
 * Fail-fast preflight. Bench expects Postgres seeded with app data and the
 * backend/cdc/yjs/mcp services already running via `pnpm dev`; it does not
 * start them. Services are polled briefly to tolerate `dev` still compiling,
 * then bench exits with an actionable message rather than hanging or
 * producing empty runs.
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

/**
 * Artillery `--overrides` payload for `--short`: collapse every phase into a
 * single 1s / 1-VU arrival and drop the ensure thresholds, so a run becomes a
 * fast "does it still work" smoke check rather than a load test. Loop `count`s
 * inside scenario flows stay as-is but execute once (single VU).
 */
const SHORT_OVERRIDES = JSON.stringify({
  config: {
    phases: [{ duration: 1, arrivalRate: 1, name: 'smoke' }],
    plugins: { ensure: { thresholds: [] } },
  },
});

function runArtillery(
  name: string,
  { short = false, quiet = false }: { short?: boolean; quiet?: boolean } = {},
): { exitCode: number; reportPath: string } {
  const reportPath = resolve(tmpdir(), `artillery-${name}-${Date.now()}.json`);
  const args = ['artillery', 'run', `scenarios/${name}.yaml`, '--output', reportPath];
  if (short) args.push('--overrides', SHORT_OVERRIDES);
  try {
    execFileSync('npx', args, {
      cwd: BENCH_ROOT,
      // Quiet runs (used by --all) hide Artillery's live report, but still pipe
      // output. Artillery exits non-zero when stdout/stderr are ignored.
      stdio: quiet ? 'pipe' : 'inherit',
      env: createBenchProcessEnv(),
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    });
    return { exitCode: 0, reportPath };
  } catch (err) {
    const code = (err as { status?: number }).status ?? 1;
    // Artillery exits 1 when ensure checks fail; the report is already printed above
    if (!quiet) {
      console.error(`\n${pc.red('✗')} artillery exited with code ${code}`);
    } else {
      const output = [
        String((err as { stdout?: string }).stdout ?? ''),
        String((err as { stderr?: string }).stderr ?? ''),
      ]
        .join('\n')
        .trim();
      if (output) {
        const lines = output.split('\n').slice(-40).join('\n');
        console.error(`\n${pc.red('✗')} ${name} artillery output:\n${lines}\n`);
      }
    }
    return { exitCode: code, reportPath };
  }
}

/**
 * Background CDC health poller. Runs automatically for every scenario, with
 * no flag or developer awareness needed. Collects throughput/latency samples
 * silently and only emits a summary if CDC actually processed events, so
 * read-only scenarios stay clean. Runs as a separate process because
 * `runArtillery` blocks the event loop via synchronous `execFileSync`.
 *
 * Returns the process and a promise resolving to the collected summary output
 * once the poller has flushed and exited.
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
    // Support both a single-object file and an array of runs
    const runs: BaselineMetrics[] = Array.isArray(data) ? data : [data];
    return runs.at(-1) ?? null;
  } catch {
    return null;
  }
}

function saveBaseline(metrics: BaselineMetrics, { quiet = false }: { quiet?: boolean } = {}): void {
  mkdirSync(BASELINES_DIR, { recursive: true });
  const file = resolve(BASELINES_DIR, `${metrics.scenario}.json`);

  let runs: BaselineMetrics[] = [];
  if (existsSync(file)) {
    try {
      const data = JSON.parse(readFileSync(file, 'utf-8'));
      runs = Array.isArray(data) ? data : [data];
    } catch {
      // Corrupt file: start fresh
    }
  }

  runs.push(metrics);
  writeFileSync(file, `${JSON.stringify(runs, null, 2)}\n`);

  if (quiet) return;

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

/**
 * One combined table for a `--all` run: a row per scenario with its key metrics
 * and the p95 delta vs the previous baseline. Printed once at the end so the run
 * stays quiet until every scenario is done.
 */
function printAllSummary(results: { name: string; result: ScenarioResult }[]): void {
  console.info(`\n${pc.bold('Summary')} ${pc.dim('— all scenarios')}\n`);

  const cols = `  ${pc.bold('Scenario'.padEnd(22))} ${pc.bold('Req/s'.padStart(8))} ${pc.bold('Mean'.padStart(8))} ${pc.bold('p95'.padStart(8))} ${pc.bold('p99'.padStart(8))} ${pc.bold('Errors'.padStart(8))} ${pc.bold('p95 Δ'.padStart(10))}`;
  console.info(cols);
  console.info(`  ${'─'.repeat(80)}`);

  for (const { name, result } of results) {
    const { current, baseline, exitCode } = result;
    const fail = exitCode === 0 ? '' : pc.red('  ✗');

    if (!current) {
      console.info(`  ${name.padEnd(22)} ${pc.dim('no metrics'.padStart(8))}${fail}`);
      continue;
    }

    const delta = baseline ? formatDelta(current.p95, baseline.p95, true) : pc.dim('new');
    console.info(
      `  ${name.padEnd(22)} ${String(current.requestRate).padStart(8)} ${String(current.mean).padStart(8)} ${String(current.p95).padStart(8)} ${String(current.p99).padStart(8)} ${String(current.errors).padStart(8)} ${delta.padStart(10)}${fail}`,
    );
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

// ── Run a single scenario ──────────────────────────────────────────────────

interface ScenarioResult {
  exitCode: number;
  /** Aggregate metrics for this run, or null for short/failed runs. */
  current: BaselineMetrics | null;
  /** Previous baseline this run was compared against, or null on a first run. */
  baseline: BaselineMetrics | null;
}

/**
 * Run one scenario end to end: start the silent CDC poller, run Artillery, then
 * (for full runs) compare against and save the baseline. Short runs are smoke
 * checks, so their metrics are not comparable and never touch baselines.
 *
 * In `quiet` mode (used by `--all`) Artillery output is hidden behind a spinner
 * and the per-scenario comparison table is skipped. The caller prints one
 * combined summary at the end. Returns the run's exit code and metrics.
 */
async function runScenario(
  name: string,
  { short, quiet }: { short: boolean; quiet: boolean },
): Promise<ScenarioResult> {
  const cdcPoller = startCdcPoller();
  const stopPoller = () => cdcPoller.proc.kill('SIGINT');
  registerCleanup(stopPoller);

  const spinner = quiet ? ora(`running ${name}${short ? ' (short)' : ''}...`).start() : null;
  if (!quiet) console.info(`${pc.cyan('▸')} running ${pc.bold(name)}${short ? pc.dim(' (short)') : ''}...\n`);

  const { exitCode, reportPath } = runArtillery(name, { short, quiet });

  // Stop the poller and flush its summary (printed only if CDC saw events).
  stopPoller();
  const cdcSummary = (await cdcPoller.summary).trimEnd();

  let current: BaselineMetrics | null = null;
  let baseline: BaselineMetrics | null = null;

  if (!short) {
    current = extractMetrics(reportPath, name);
    if (current) {
      baseline = loadBaseline(name);
      if (!quiet) printComparison(current, baseline);
      saveBaseline(current, { quiet });
    }
  }

  if (spinner) {
    if (exitCode === 0) spinner.succeed(`${name} ${pc.dim('done')}`);
    else spinner.fail(`${name} ${pc.dim(`exited ${exitCode}`)}`);
  }

  // Verbose runs print CDC throughput inline; quiet runs stay clean for the summary.
  if (!quiet && cdcSummary) console.info(cdcSummary);

  return { exitCode, current, baseline };
}

// ── Main ───────────────────────────────────────────────────────────────────

/**
 * Orchestrates a bench run: verifies infrastructure is up, seeds bench data,
 * clears rate limits, then runs the selected scenario(s) via Artillery.
 */
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
  const { scenario: cliScenario, skipSeed, all, short, help } = parseArgs();

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

  // Seed in parallel whenever there is no interactive picker to corrupt
  // (--all or an explicit scenario). The picker path seeds after selection.
  let seedPromise: Promise<void> | undefined;
  if (!skipSeed && (cliScenario || all)) {
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

  let selected = '';

  if (!all) {
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
  }

  // Seed after interactive selection (safe: no TUI active)
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

  // ── 4. Run scenario(s) ──

  const toRun = all ? scenarios : [selected];
  // --all runs quietly and prints one combined summary at the end; a single
  // scenario stays verbose with live Artillery output and a comparison table.
  const quiet = all;
  // Cooldown between scenarios so load from one run settles before the next.
  // Skipped for short smoke runs, where speed matters more than isolation.
  const pauseSeconds = all && !short ? PAUSE_SECONDS : 0;

  const results: { name: string; result: ScenarioResult }[] = [];
  let failureCode = 0;
  try {
    for (let i = 0; i < toRun.length; i++) {
      const name = toRun[i];
      const result = await runScenario(name, { short, quiet });
      results.push({ name, result });
      if (result.exitCode !== 0) failureCode = result.exitCode;

      if (pauseSeconds > 0 && i < toRun.length - 1) {
        const cooldown = ora(`cooling down ${pauseSeconds}s...`).start();
        await sleep(pauseSeconds * 1000);
        cooldown.stop();
      }
    }
  } finally {
    cleanup();
  }

  if (all) {
    if (short) {
      const failed = results.filter(({ result }) => result.exitCode !== 0).map(({ name }) => name);
      if (failed.length === 0) {
        console.info(`\n${pc.green('✓')} all scenarios completed short run\n`);
      } else {
        console.info(`\n${pc.red('✗')} short run failed for ${failed.join(', ')}\n`);
      }
    } else printAllSummary(results);
  }

  if (failureCode !== 0) process.exit(failureCode);
}

main().catch((err) => {
  console.error(pc.red('bench failed:'), err);
  cleanup();
  process.exit(1);
});
