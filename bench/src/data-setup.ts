import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ora, { type Ora } from 'ora';
import pg from 'pg';
import pc from 'picocolors';
import { setMockContext } from '#/mocks';
import { DB_URL } from './config';
import { type BenchSeed, getBenchSeedName, getBenchSeeds } from './registry';
import { cleanupBenchSeed, insertSeedRows } from './seed-utils';

// Set mock context so any mockNanoid() calls use 'lt-' prefix
setMockContext('loadtest');

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const SEEDS_DIR = resolve(__dirname, 'seeds');

/**
 * Auto-import every `*.bench.ts` module under seeds/ so each self-registers
 * its seed target (core data + any fork-defined entities/resources). No barrel
 * or data-setup edit is needed to add a new load-test table.
 */
async function loadBenchEntities(): Promise<void> {
  for (const file of readdirSync(SEEDS_DIR)
    .filter((f) => f.endsWith('.bench.ts'))
    .sort()) {
    await import(pathToFileURL(resolve(SEEDS_DIR, file)).href);
  }
}

const { Pool } = pg;

// ── Configuration ──────────────────────────────────────────────────────────
const QUERY_TIMEOUT_MS = 60_000;

// ── Spinner helpers ────────────────────────────────────────────────────────

let spinner: Ora | null = null;

function startSpinner(text: string) {
  spinner = ora({ text }).start();
}

function succeedSpinner(text?: string) {
  if (spinner) spinner.succeed(text);
  spinner = null;
}

function failSpinner(text: string) {
  if (spinner) spinner.fail(text);
  spinner = null;
}

function updateSpinner(text: string) {
  if (spinner) spinner.text = text;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function runBenchSeed(pool: pg.Pool, seed: BenchSeed, now: string): Promise<void> {
  const name = getBenchSeedName(seed);

  if (seed.kind === 'custom') {
    if (!seed.seed) return;
    startSpinner(`seeding ${name}...`);
    await seed.seed({ now, pool });
    succeedSpinner(`${name} seeded`);
    return;
  }

  const rows = seed.rows({ now, pool });
  startSpinner(`seeding ${pc.cyan(String(rows.length))} ${seed.table}...`);
  if (rows.length === 0) {
    succeedSpinner(`0 ${seed.table} inserted`);
    return;
  }
  await insertSeedRows(pool, seed, rows);
  succeedSpinner(`${rows.length} ${seed.table} inserted`);
}

// ── Clean existing loadtest data ────────────────────────────────────────────

async function cleanLoadtestData(pool: pg.Pool) {
  startSpinner('cleaning existing bench data...');

  // Drop the CDC replication slot if it exists: an unconsumed slot blocks DELETEs on published tables
  await pool
    .query(`SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots WHERE slot_name = 'cdc_slot'`)
    .catch(() => {});

  // Disable FK trigger checks for this session: avoids expensive SET NULL cascades
  // across 19 FK constraints when deleting loadtest users (full-table scans on each)
  const client = await pool.connect();
  try {
    await client.query(`SET session_replication_role = 'replica'`);

    for (const seed of [...getBenchSeeds()].reverse()) {
      updateSpinner(`cleaning ${getBenchSeedName(seed)}...`);
      await cleanupBenchSeed(client, seed);
    }
  } finally {
    await client.query(`SET session_replication_role = 'origin'`).catch(() => {});
    client.release();
  }
  succeedSpinner('existing bench data cleaned');
}

// ── Seed ───────────────────────────────────────────────────────────────────

/**
 * Seeds deterministic bench data into the dev database using mock generators
 * from backend/mocks for type-safe, schema-aligned rows. Idempotent: cleans
 * existing bench data before re-seeding. Run with `pnpm db:seed`.
 */
async function seed() {
  const pool = new Pool({ connectionString: DB_URL, statement_timeout: QUERY_TIMEOUT_MS });

  try {
    await loadBenchEntities();

    startSpinner('connecting to database...');
    await pool.query('SELECT 1');
    succeedSpinner('connected to database');

    await cleanLoadtestData(pool);

    const now = new Date().toISOString();

    for (const seed of getBenchSeeds()) {
      await runBenchSeed(pool, seed, now);
    }

    console.info(`\n${pc.green('✓')} Seed completed successfully.`);
  } catch (err) {
    failSpinner('seed step failed');
    throw err;
  } finally {
    await pool.end();
  }
}

// ── Teardown ───────────────────────────────────────────────────────────────

/** Deletes all bench data without reseeding. Run with `pnpm db:teardown`. */
async function teardown() {
  const pool = new Pool({ connectionString: DB_URL, statement_timeout: QUERY_TIMEOUT_MS });

  try {
    await loadBenchEntities();
    await cleanLoadtestData(pool);
    console.info(`\n${pc.green('✓')} Teardown completed.`);
  } catch (err) {
    failSpinner('teardown step failed');
    throw err;
  } finally {
    await pool.end();
  }
}

// ── CLI entry point ────────────────────────────────────────────────────────

const isTeardown = process.argv.includes('--teardown');

if (isTeardown) {
  teardown()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Teardown failed:', err);
      process.exit(1);
    });
} else {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
