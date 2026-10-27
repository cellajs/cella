#!/usr/bin/env tsx
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { select } from '@inquirer/prompts';
import ora from 'ora';
import pg from 'pg';
import pc from 'picocolors';
import { appConfig } from 'shared';
import { printHeader } from 'shared/cli-utils/display';
import { benchUuidPrefix } from 'shared/utils/bench-identity';
import { BASE_URL, COOKIE_SECRET, DB_URL, SESSION_COOKIE_NAME } from './config';
import { benchSignInStatus, isPostgresReady, isServiceHealthy, SERVICES, unreadyReason } from './preflight';
import { acquireLock, benchDataDir, type CheckResult, type RunResult, runScenario, type Scenario } from './runner';
import { booksFindings, type PipelineSnapshot, pipelineFindings, settlePipeline } from './verify';

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const BENCH_ROOT = resolve(__dirname, '..');
const SCENARIOS_DIR = resolve(BENCH_ROOT, 'scenarios');

/** Cooldown between scenarios in `--all` mode: after a saturating scenario, 5s left sse-fanout's p95 ten times higher. */
const PAUSE_SECONDS = 15;

// ── CLI args ───────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let scenario: string | undefined;
  let skipSeed = false;
  let all = false;
  let short = false;
  let ifReady = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    // `--scenario <name>` is an alias for the positional argument below.
    if (arg === '--scenario' && args[i + 1]) scenario = args[++i];
    else if (arg === '--skip-seed') skipSeed = true;
    else if (arg === '--all') all = true;
    else if (arg === '--short') short = true;
    else if (arg === '--if-ready') ifReady = true;
    else if (arg === 'help' || arg === '--help' || arg === '-h') help = true;
    // First bare (non-flag) argument is the scenario name.
    else if (!arg.startsWith('-') && scenario === undefined) scenario = arg;
  }

  return { scenario, skipSeed, all, short, ifReady, help };
}

// ── Scenario discovery ─────────────────────────────────────────────────────

/** Every `scenarios/*.ts` module by name, so an app adds a scenario by dropping in one file. */
async function loadScenarios(): Promise<Map<string, Scenario>> {
  const names = readdirSync(SCENARIOS_DIR)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => basename(file, '.ts'))
    .sort();
  const scenarios = new Map<string, Scenario>();
  for (const name of names) {
    const scenario = (await import(pathToFileURL(resolve(SCENARIOS_DIR, `${name}.ts`)).href)).default as Scenario | undefined;
    if (typeof scenario?.description !== 'string') throw new Error(`scenarios/${name}.ts has no \`export default defineScenario(...)\``);
    scenarios.set(name, scenario);
  }
  return scenarios;
}

function printUsage(scenarios: Map<string, Scenario>): void {
  console.info(`${pc.bold('Usage:')} pnpm bench [scenario] [--all] [--short] [--skip-seed] [--if-ready]\n`);
  console.info('Run without a scenario for an interactive picker.\n');
  console.info(pc.bold('Flags:'));
  console.info(`  ${'--all'.padEnd(22)}${pc.dim('run every scenario in sequence, one line each and a final summary')}`);
  console.info(`  ${'--short'.padEnd(22)}${pc.dim('smoke run: one VU per role, no thresholds, no baselines')}`);
  console.info(`  ${'--skip-seed'.padEnd(22)}${pc.dim('skip bench data seeding')}`);
  console.info(`  ${'--if-ready'.padEnd(22)}${pc.dim("do nothing when this checkout's stack is not running or busy")}\n`);
  console.info(pc.bold('Scenarios:'));
  for (const [name, scenario] of scenarios) console.info(`  ${name.padEnd(22)}${pc.dim(scenario.description)}`);
  console.info();
}

// ── Helpers ────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Preflight ──────────────────────────────────────────────────────────────

/** Bench does not start services: Postgres must be seeded and backend/cdc/yjs/mcp up via `pnpm dev`. Services are polled briefly to tolerate `dev` still compiling. */
async function assertInfrastructureReady(): Promise<void> {
  const spinner = ora('checking infrastructure...').start();

  if (!(await isPostgresReady())) {
    spinner.fail('postgres is not reachable');
    const { hostname, port } = new URL(DB_URL);
    console.error(pc.dim(`  Expected Postgres at ${hostname}:${port}. Start it with \`pnpm docker\` and seed with \`pnpm seed\`.`));
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

/** Bench user 0 signs in before anything is measured: with its cookie rejected, every scenario would time 401s. */
async function assertBenchSignIn(skipSeed: boolean): Promise<void> {
  const status = await benchSignInStatus();
  if (status === 200) return;

  console.error(`${pc.red('✗')} bench user 0 could not sign in: ${BASE_URL}/me answered ${status ?? 'nothing'}`);
  console.error(
    pc.dim(
      `  The cookie is named ${SESSION_COOKIE_NAME}, after config mode "${appConfig.mode}" (APP_MODE or NODE_ENV): the stack must run in that mode.`,
    ),
  );
  console.error(
    pc.dim(
      COOKIE_SECRET
        ? '  It is signed with COOKIE_SECRET from backend/.env: the stack must use the same one.'
        : '  COOKIE_SECRET is not set: bench reads it from backend/.env.',
    ),
  );
  if (skipSeed) console.error(pc.dim('  With --skip-seed the bench users must be seeded already: run once without it.'));
  process.exit(1);
}

/** Password attempts and every budget keyed by a bench user: per-user limits (stream connects, sync reads) span runs. */
async function clearRateLimits(): Promise<void> {
  const pool = new pg.Pool({ connectionString: DB_URL });
  try {
    await pool.query("DELETE FROM rate_limits WHERE key LIKE 'password_%' OR strpos(key, $1) > 0", [benchUuidPrefix]);
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
    const child = spawn('tsx', ['src/data-setup.ts'], { cwd: BENCH_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', (data: Buffer) => chunks.push(data.toString()));
    child.stderr?.on('data', (data: Buffer) => chunks.push(data.toString()));
    child.on('close', (code) =>
      code === 0 ? resolve({ output: chunks.join('') }) : reject(new Error(`db:seed exited with code ${code}\n${chunks.join('')}`)),
    );
    child.on('error', reject);
  });
}

function startSeed(): Promise<void> {
  const spinner = ora('seeding database...').start();
  return seedDatabase()
    .then(() => {
      spinner.succeed('database ready');
    })
    .catch((err: Error) => {
      spinner.fail('database seed failed');
      console.error(err.message);
      process.exit(1);
    });
}

// ── App checks ─────────────────────────────────────────────────────────────

/**
 * What the CDC worker made of a run, as checks: it caught up, recorded one activity per row the scenario wrote, and
 * kept its counts; a full run ends with the worker's verify of its books. A run whose responses were rejected is not
 * checked: it timed rejections.
 */
async function pipelineChecks(
  before: PipelineSnapshot | null,
  { counters, checks, short }: { counters: Record<string, number>; checks: CheckResult[]; short: boolean },
): Promise<{ checks: CheckResult[]; caughtUpMs: number | null }> {
  if (!before || checks.some((check) => check.id === 'responses' && !check.ok)) return { checks: [], caughtUpMs: null };
  const written = counters['bench.rows_written'];
  const { snapshot: after, caughtUpMs } = await settlePipeline(written === undefined ? undefined : before.activities + written);
  if (caughtUpMs === null || !after)
    return { checks: [{ id: 'cdc', ok: false, text: 'the CDC worker did not catch up within 60 s of the run' }], caughtUpMs: null };

  const results: CheckResult[] = pipelineFindings(before, after, counters).map((text) => ({ id: 'cdc', ok: false, text }));
  const recorded = after.activities - before.activities;
  if (results.length === 0 && (written !== undefined || recorded > 0)) {
    const exact = written === undefined ? '' : ' = rows written';
    results.push({
      id: 'cdc',
      ok: true,
      text: `CDC caught up in ${(caughtUpMs / 1000).toFixed(1)} s, activities +${recorded.toLocaleString('en-US')}${exact}`,
    });
  }
  if (!short) {
    const books = await booksFindings();
    if (books.length === 0) results.push({ id: 'books', ok: true, text: "CDC worker's books match the tables" });
    else results.push(...books.map((text) => ({ id: 'books', ok: false, text })));
  }
  return { checks: results, caughtUpMs: written === undefined ? null : caughtUpMs };
}

// ── Summary ────────────────────────────────────────────────────────────────

interface ScenarioOutcome {
  name: string;
  result: RunResult;
  /** How long the CDC worker needed after the run to record its writes; null for a run that wrote nothing it counts. */
  caughtUpMs: number | null;
}

function formatDelta(current: number, baseline: number): string {
  if (baseline === 0) return '';
  const pct = ((current - baseline) / baseline) * 100;
  if (Math.abs(pct) < 1) return pc.dim('~0%');
  const label = `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`;
  return pct < 0 ? pc.green(label) : pc.red(label);
}

/** Combined `--all` table: one row per scenario with its numbers, the seconds the CDC worker needed to catch up, and the primary latency's change from its baseline. */
function printAllSummary(outcomes: ScenarioOutcome[]): void {
  console.info(`\n${pc.bold('Summary')} ${pc.dim(': all scenarios')}\n`);
  const num = (n: number) => (n === 0 ? '-' : n < 10 ? n.toFixed(1) : String(Math.round(n)));
  console.info(
    `  ${pc.bold('Scenario'.padEnd(22))} ${pc.bold('Req/s'.padStart(8))} ${pc.bold('p50'.padStart(8))} ${pc.bold('p95'.padStart(8))} ${pc.bold('p99'.padStart(8))} ${pc.bold('Errors'.padStart(8))} ${pc.bold('CDC +s'.padStart(8))} ${pc.bold('Primary Δ'.padStart(10))}`,
  );
  console.info(`  ${'─'.repeat(89)}`);

  for (const { name, result, caughtUpMs } of outcomes) {
    const { current, baseline, ok } = result;
    const caughtUp = caughtUpMs === null ? '-' : (caughtUpMs / 1000).toFixed(1);
    const delta = baseline ? formatDelta(current.primary.value, baseline.primary.value) : pc.dim(ok ? 'new' : '-');
    console.info(
      `  ${name.padEnd(22)} ${num(current.requestRate).padStart(8)} ${num(current.p50).padStart(8)} ${num(current.p95).padStart(8)} ${num(current.p99).padStart(8)} ${String(current.errors).padStart(8)} ${caughtUp.padStart(8)} ${delta.padStart(10)}${ok ? '' : pc.red('  ✗')}`,
    );
  }
  console.info();
}

async function main() {
  process.on('SIGINT', () => process.exit(130));
  process.on('SIGTERM', () => process.exit(143));

  printHeader('bench cli');

  const scenarios = await loadScenarios();
  const { scenario: cliScenario, skipSeed, all, short, ifReady, help } = parseArgs();

  if (scenarios.size === 0) {
    console.error(pc.red('No scenarios found in scenarios/'));
    process.exit(1);
  }

  if (help) {
    printUsage(scenarios);
    process.exit(0);
  }

  if (cliScenario && !scenarios.has(cliScenario)) {
    console.error(pc.red(`Unknown scenario: ${cliScenario}`));
    console.error(pc.dim(`Available: ${[...scenarios.keys()].join(', ')}`));
    process.exit(1);
  }

  // ── 1. Infrastructure ──

  // Without a stack of this checkout there is nothing to run, and with `--if-ready` that is no failure.
  const unready = ifReady ? await unreadyReason() : null;
  if (unready) {
    console.info(pc.dim(`skipped: ${unready}.`));
    process.exit(0);
  }

  await assertInfrastructureReady();

  // One run per stack: a second one would seed and reset under the first one's measurement.
  const dataDir = benchDataDir(BENCH_ROOT);
  const claimed = acquireLock(dataDir, BASE_URL, cliScenario ?? (all ? '--all' : 'picker'));
  if ('holder' in claimed) {
    const { holder } = claimed;
    const since = new Date(holder.startedAt).toLocaleTimeString('en-GB');
    const message = `another bench run holds ${BASE_URL}: pid ${holder.pid} runs ${holder.scenario} since ${since}`;
    if (ifReady) {
      console.info(pc.dim(`skipped: ${message}.`));
      process.exit(0);
    }
    console.error(`${pc.red('✗')} ${message}`);
    process.exit(1);
  }
  const { lock } = claimed;
  for (const other of lock.others) {
    console.info(pc.yellow(`⚠ bench pid ${other.pid} runs ${other.scenario} on ${other.target}: it shares this machine, numbers will be skewed`));
  }

  // ── 2. Scenario selection ──

  // Seeding runs in parallel when no interactive picker is on screen; the picker path seeds after selection.
  let seedPromise = !skipSeed && (cliScenario || all) ? startSeed() : undefined;

  let selected = cliScenario ?? '';
  if (!all && !cliScenario) {
    const choices = [
      ...[...scenarios].map(([name, scenario]) => ({ value: name, name: `${name.padEnd(22)}${pc.dim(scenario.description)}` })),
      { type: 'separator' as const, separator: '─'.repeat(40) },
      { value: 'exit', name: pc.red(`exit${' '.repeat(18)}${pc.dim('quit without running')}`) },
    ];
    selected = await select({ message: 'select scenario', choices });
    if (selected === 'exit') {
      console.info(pc.dim('\nexited.'));
      process.exit(0);
    }
  }

  // Seed after interactive selection (safe: no TUI active)
  if (!skipSeed && !seedPromise) seedPromise = startSeed();
  if (seedPromise) await seedPromise;
  await assertBenchSignIn(skipSeed);

  // ── 3. Run scenario(s), each from cleared rate limits and a settled pipeline ──

  const toRun = all ? [...scenarios.keys()] : [selected];
  // Cooldown so load from one run settles before the next; skipped for short smoke runs.
  const pauseSeconds = all && !short ? PAUSE_SECONDS : 0;

  const outcomes: ScenarioOutcome[] = [];
  for (let i = 0; i < toRun.length; i++) {
    const name = toRun[i];
    lock.update(name);
    await clearRateLimits();
    // Whatever was written before, the seed included, is settled first: the run's own writes are then all that changes.
    const { snapshot: before } = await settlePipeline();
    let caughtUpMs: number | null = null;
    const result = await runScenario(scenarios.get(name) as Scenario, {
      name,
      target: BASE_URL,
      dataDir,
      short,
      quiet: all,
      legacyBaselineFile: resolve(BENCH_ROOT, '.baselines', `${name}.json`),
      afterRun: async (outcome) => {
        const pipeline = await pipelineChecks(before, outcome);
        caughtUpMs = pipeline.caughtUpMs;
        return pipeline.checks;
      },
    });
    outcomes.push({ name, result, caughtUpMs });

    if (pauseSeconds > 0 && i < toRun.length - 1) {
      const cooldown = ora(`cooling down ${pauseSeconds}s...`).start();
      await sleep(pauseSeconds * 1000);
      cooldown.stop();
    }
  }

  const failed = outcomes.filter(({ result }) => !result.ok).map(({ name }) => name);
  if (all) {
    if (!short) printAllSummary(outcomes);
    else if (failed.length === 0) console.info(`\n${pc.green('✓')} all scenarios completed short run\n`);
    else console.info(`\n${pc.red('✗')} short run failed for ${failed.join(', ')}\n`);
  }

  lock.release();
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(pc.red('bench failed:'), err);
  process.exit(1);
});
