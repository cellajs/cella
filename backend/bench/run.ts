import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { type AppChecks, type CheckResult, type RunOutcome, runBench } from '@cellajs/cli/bench';
import pg from 'pg';
import { appConfig } from 'shared';
import { benchUuidPrefix } from 'shared/utils/bench-identity';
import { BASE_URL, COOKIE_SECRET, DB_URL, SESSION_COOKIE_NAME } from './config';
import { benchSignInStatus, isPostgresReady, isServiceHealthy, SERVICES } from './preflight';
import { booksFindings, type PipelineSnapshot, pipelineFindings, settlePipeline } from './verify';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Bench starts no services: Postgres and the stack must answer. The services are polled briefly, for a stack still compiling. */
async function preflight(): Promise<void> {
  if (!(await isPostgresReady())) {
    const { hostname, port } = new URL(DB_URL);
    throw new Error(`postgres is not reachable at ${hostname}:${port}: start it with \`pnpm docker\`, or run with --isolated`);
  }
  const deadline = Date.now() + 15_000;
  for (const [name, url] of Object.entries(SERVICES)) {
    while (!(await isServiceHealthy(url))) {
      if (Date.now() >= deadline) throw new Error(`${name} is not reachable at ${url}: start the stack with \`pnpm dev\`, or run with --isolated`);
      await sleep(1000);
    }
  }
}

/** Runs `data-setup.ts` on its own: it registers its seeds as import side effects and exits when done. */
function seed(): Promise<void> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const child = spawn('tsx', [fileURLToPath(new URL('./data-setup.ts', import.meta.url))], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (data: Buffer) => chunks.push(data.toString()));
    child.stderr.on('data', (data: Buffer) => chunks.push(data.toString()));
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`the bench seed exited with code ${code}\n${chunks.join('')}`))));
    child.on('error', reject);
  });
}

/** Bench user 0 signs in before anything is measured: with its cookie rejected, every scenario would time 401s. */
async function beforeAll({ skipSeed }: { skipSeed: boolean }): Promise<void> {
  const status = await benchSignInStatus();
  if (status === 200) return;
  throw new Error(
    [
      `bench user 0 could not sign in: ${BASE_URL}/me answered ${status ?? 'nothing'}`,
      `  The cookie is named ${SESSION_COOKIE_NAME}, after config mode "${appConfig.mode}" (APP_MODE or NODE_ENV): the stack must run in that mode.`,
      COOKIE_SECRET
        ? '  It is signed with COOKIE_SECRET from backend/.env: the stack must use the same one.'
        : '  COOKIE_SECRET is not set: bench reads it from backend/.env.',
      ...(skipSeed ? ['  With --skip-seed the bench users must be seeded already: run once without it.'] : []),
    ].join('\n'),
  );
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

/** Each scenario starts from cleared rate limits and a settled pipeline: its own writes are then all that changes. */
async function beforeEach(): Promise<PipelineSnapshot | null> {
  await clearRateLimits();
  const { snapshot } = await settlePipeline();
  return snapshot;
}

/**
 * What the CDC worker made of a run, as checks: it caught up, recorded one activity per row the scenario wrote, and
 * kept its counts; a full run ends with the worker's verify of its books. A run whose responses were rejected is not
 * checked: it timed rejections. The `--all` table shows how long the worker still needed.
 */
async function afterEach({ counters, checks, short }: RunOutcome, before: PipelineSnapshot | null | undefined): Promise<AppChecks> {
  if (!before || checks.some((check) => check.id === 'responses' && !check.ok)) return { checks: [] };
  const written = counters['bench.rows_written'];
  const { snapshot: after, caughtUpMs } = await settlePipeline(written === undefined ? undefined : before.activities + written);
  if (caughtUpMs === null || !after) return { checks: [{ id: 'cdc', ok: false, text: 'the CDC worker did not catch up within 60 s of the run' }] };

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
  return { checks: results, columns: written === undefined ? {} : { 'CDC +s': (caughtUpMs / 1000).toFixed(1) } };
}

await runBench({ target: BASE_URL, preflight, seed, beforeAll, beforeEach, afterEach });
