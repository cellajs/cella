#!/usr/bin/env tsx
/**
 * Bench CLI — single-command orchestrator for Artillery load tests.
 *
 * Starts all required infrastructure (Docker Postgres, backend, CDC, yjs),
 * seeds test data, clears rate limits, and runs the selected scenario.
 *
 * Usage:
 *   pnpm bench                                        # interactive
 *   pnpm bench -- --scenario attachment-edit           # direct
 *   pnpm bench -- --scenario attachment-edit --skip-seed     # skip seeding
 *   pnpm bench -- --skip-services                      # use already-running services
 *   pnpm bench -- --keep-services                      # don't stop services after run
 *   pnpm bench -- --scenario attachment-edit --save-baseline  # save results as baseline
 */

import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { select } from '@inquirer/prompts';
import pg from 'pg';
import ora from 'ora';
import pc from 'shared/cli-utils/colors';
import { printHeader } from 'shared/cli-utils/display';

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const BENCH_ROOT = resolve(__dirname, '..');
const WORKSPACE_ROOT = resolve(BENCH_ROOT, '..');
const BACKEND_DIR = resolve(WORKSPACE_ROOT, 'backend');

const PG = { host: '0.0.0.0', port: 5433, user: 'postgres', password: 'postgres', database: 'postgres' };

const SERVICES = {
  backend: 'http://localhost:4000/health',
  cdc: 'http://localhost:4001/health',
  yjs: 'http://localhost:4002/health',
} as const;

// ── CLI args ───────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let scenario: string | undefined;
  let skipSeed = false;
  let skipServices = false;
  let keepServices = false;
  let poller = false;
  let saveBaseline = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--scenario' && args[i + 1]) scenario = args[++i];
    if (args[i] === '--skip-seed') skipSeed = true;
    if (args[i] === '--skip-services') skipServices = true;
    if (args[i] === '--keep-services') keepServices = true;
    if (args[i] === '--poller') poller = true;
    if (args[i] === '--save-baseline') saveBaseline = true;
  }

  return { scenario, skipSeed, skipServices, keepServices, poller, saveBaseline };
}

// ── Scenario discovery ─────────────────────────────────────────────────────

const descriptions: Record<string, string> = {
  'page-load': 'Page-load reads (60 arrivals/s, ~2700 req/s)',
  'attachment-edit': 'Attachment edit step-up (25→100 arrivals/s, ~1200 req/s)',
  'get-me': 'GET /me sustained (100 arrivals/s, ~2000 req/s)',
  'sign-in': 'Sign-in throughput (10→50 arrivals/s)',
};

function discoverScenarios(): string[] {
  const dir = resolve(BENCH_ROOT, 'scenarios');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => basename(f, '.yaml'))
    .sort();
}

// ── Helpers ────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Postgres ───────────────────────────────────────────────────────────────

async function isPostgresReady(): Promise<boolean> {
  const pool = new pg.Pool({ ...PG, connectionTimeoutMillis: 2000 });
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

async function ensurePostgres(): Promise<void> {
  const spinner = ora('checking postgres...').start();

  if (await isPostgresReady()) {
    spinner.succeed('postgres already running');
    return;
  }

  spinner.text = 'starting postgres (docker compose up db)...';
  execSync('docker compose up db -d', { cwd: BACKEND_DIR, stdio: 'pipe' });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await isPostgresReady()) {
      spinner.succeed('postgres ready');
      return;
    }
    await sleep(500);
  }

  spinner.fail('postgres did not start within 30s');
  process.exit(1);
}

// ── Service health ─────────────────────────────────────────────────────────

async function isServiceHealthy(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    return res.status === 204 || res.ok;
  } catch {
    return false;
  }
}

async function allServicesHealthy(): Promise<boolean> {
  const checks = await Promise.all(Object.values(SERVICES).map(isServiceHealthy));
  return checks.every(Boolean);
}

async function waitForServices(): Promise<void> {
  const spinner = ora('waiting for services...').start();
  const deadline = Date.now() + 60_000;

  for (const [name, url] of Object.entries(SERVICES)) {
    while (Date.now() < deadline) {
      if (await isServiceHealthy(url)) break;
      await sleep(1000);
    }
    if (Date.now() >= deadline) {
      spinner.fail(`${name} did not become healthy within 60s`);
      process.exit(1);
    }
    spinner.text = `${name} ready`;
  }

  spinner.succeed('all services ready');
}

// ── Port cleanup ───────────────────────────────────────────────────────────

function killStalePorts(): void {
  for (const port of [4000, 4001, 4002]) {
    try {
      const pids = execSync(`lsof -ti :${port} 2>/dev/null`, { encoding: 'utf-8' }).trim();
      if (pids) {
        execSync(`echo "${pids}" | xargs kill -9 2>/dev/null`, { stdio: 'pipe' });
        console.info(`  ${pc.dim(`killed stale process(es) on port ${port}`)}`);
      }
    } catch {
      // No processes on this port — fine
    }
  }
}

// ── Service orchestration ──────────────────────────────────────────────────

function startServices(): ChildProcess {
  console.info(`${pc.cyan('▸')} starting backend, cdc, yjs...\n`);

  const child = spawn(
    'pnpm',
    ['-r', '--parallel', '--stream', '--filter', 'backend', '--filter', 'cdc', '--filter', 'yjs', 'dev'],
    {
      cwd: WORKSPACE_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DEV_MODE: 'full', PINO_LOG_LEVEL: 'warn' },
    },
  );

  // Collect output for debugging if health checks fail
  const logs: string[] = [];
  child.stdout?.on('data', (data: Buffer) => logs.push(data.toString()));
  child.stderr?.on('data', (data: Buffer) => logs.push(data.toString()));

  child.on('close', (code) => {
    if (code && code !== 0) {
      console.error(pc.red(`\nservices exited with code ${code}`));
      console.error(pc.dim(logs.slice(-20).join('')));
    }
  });

  return child;
}

// ── Rate limits ────────────────────────────────────────────────────────────

async function clearRateLimits(): Promise<void> {
  const pool = new pg.Pool(PG);
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
    execSync(`npx artillery run scenarios/${name}.yaml --output ${reportPath}`, { cwd: BENCH_ROOT, stdio: 'inherit' });
    return { exitCode: 0, reportPath };
  } catch (err) {
    const code = (err as { status?: number }).status ?? 1;
    // Artillery exits 1 when ensure checks fail — the report is already printed above
    console.error(`\n${pc.red('✗')} artillery exited with code ${code}`);
    return { exitCode: code, reportPath };
  }
}

function startCdcPoller(): ChildProcess {
  return spawn('tsx', ['src/cdc-poller.ts'], { cwd: BENCH_ROOT, stdio: 'inherit' });
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
  console.info(`\n${pc.green('✓')} baseline saved → ${pc.dim(`.baselines/${metrics.scenario}.json`)} ${pc.dim(`(${count} run${count === 1 ? '' : 's'})`)}`);  
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
    ['Requests', String(current.requests), baseline ? String(baseline.requests) : '-', baseline ? formatDelta(current.requests, baseline.requests, false) : ''],
    ['Req/s', String(current.requestRate), baseline ? String(baseline.requestRate) : '-', baseline ? formatDelta(current.requestRate, baseline.requestRate, false) : ''],
    ['Mean (ms)', String(current.mean), baseline ? String(baseline.mean) : '-', baseline ? formatDelta(current.mean, baseline.mean, true) : ''],
    ['p95 (ms)', String(current.p95), baseline ? String(baseline.p95) : '-', baseline ? formatDelta(current.p95, baseline.p95, true) : ''],
    ['p99 (ms)', String(current.p99), baseline ? String(baseline.p99) : '-', baseline ? formatDelta(current.p99, baseline.p99, true) : ''],
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
    console.info(`\n  ${pc.dim('No baseline found. Use --save-baseline to create one.')}`);
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
    try { fn(); } catch {}
  }
  cleanupFns.length = 0;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });

  printHeader('cella bench');

  const scenarios = discoverScenarios();
  const { scenario: cliScenario, skipSeed, skipServices, keepServices, poller, saveBaseline: shouldSave } = parseArgs();

  if (scenarios.length === 0) {
    console.error(pc.red('No scenarios found in scenarios/'));
    process.exit(1);
  }

  if (cliScenario && !scenarios.includes(cliScenario)) {
    console.error(pc.red(`Unknown scenario: ${cliScenario}`));
    console.error(pc.dim(`Available: ${scenarios.join(', ')}`));
    process.exit(1);
  }

  // ── 1. Infrastructure ──

  if (!skipServices) {
    await ensurePostgres();

    // Skip starting services if they're already healthy (e.g. running in another terminal)
    if (await allServicesHealthy()) {
      console.info(`  ${pc.green('✓')} services already running\n`);
    } else {
      killStalePorts();
      const servicesProcess = startServices();

      if (!keepServices) {
        registerCleanup(() => servicesProcess.kill('SIGTERM'));
      }

      await waitForServices();
    }
  }

  // ── 2. Scenario selection ──

  // When using --scenario, seed in parallel (no TUI to conflict with).
  // In interactive mode, seed after selection to avoid spinner corrupting the prompt.
  let seedPromise: Promise<void> | undefined;
  if (!skipSeed && cliScenario) {
    const seedSpinner = ora('seeding database...').start();
    seedPromise = seedDatabase()
      .then(() => { seedSpinner.succeed('database ready'); })
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
        name: `${name.padEnd(22)}${pc.dim(descriptions[name] ?? '')}`,
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
      .then(() => { seedSpinner.succeed('database ready'); })
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

  let pollerProcess: ChildProcess | undefined;
  if (poller || selected.startsWith('cdc-')) {
    console.info(`${pc.cyan('▸')} starting CDC health poller...\n`);
    pollerProcess = startCdcPoller();
  }

  // ── 5. Run Artillery ──

  console.info(`${pc.cyan('▸')} running ${pc.bold(selected)}...\n`);
  let artilleryExitCode = 0;
  try {
    const { exitCode, reportPath } = runArtillery(selected);
    artilleryExitCode = exitCode;

    // ── 6. Baseline comparison ──
    const metrics = extractMetrics(reportPath, selected);
    if (metrics) {
      const baseline = loadBaseline(selected);
      printComparison(metrics, baseline);
      if (shouldSave) saveBaseline(metrics);
    }
  } finally {
    pollerProcess?.kill('SIGINT');
    cleanup();
  }

  if (artilleryExitCode !== 0) process.exit(artilleryExitCode);
}

main().catch((err) => {
  console.error(pc.red('bench failed:'), err);
  cleanup();
  process.exit(1);
});
