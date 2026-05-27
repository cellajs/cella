/**
 * Database setup script for load tests.
 *
 * Seeds bench data (UUIDs prefixed with `00000001-`) into the dev database.
 * Uses mock generators from backend/mocks for type-safe, schema-aligned records.
 * Idempotent: cleans existing bench data before re-seeding.
 *
 * Run with: pnpm db:seed       (clean + seed)
 *           pnpm db:teardown   (delete all bench data)
 */

import pg from 'pg';
import { createHash } from 'node:crypto';
import ora, { type Ora } from 'ora';
import pc from 'picocolors';
import { setMockContext } from '../../backend/mocks/utils';
import {
  TENANT_ID,
  ORG_ID,
  TOTAL_USERS,
  TOTAL_PROJECTS,
  TOTAL_TASKS,
  TOTAL_ATTACHMENTS,
  loadtestUser,
  loadtestEmail,
  loadtestOrganization,
  loadtestProject,
  loadtestTask,
  loadtestAttachment,
  loadtestOrgMembership,
  loadtestProjectMemberships,
  loadtestSession,
  sessionId,
} from './generators';

// Set mock context so any mockNanoid() calls use 'lt-' prefix
setMockContext('loadtest');

const { Pool } = pg;

// ── Configuration ──────────────────────────────────────────────────────────

const PG_HOST = process.env.PG_HOST || '0.0.0.0';
const PG_PORT = process.env.PG_PORT || '5433';
const PG_USER = process.env.PG_USER || 'postgres';
const PG_PASSWORD = process.env.PG_PASSWORD || 'postgres';
const DB_URL = `postgres://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/postgres`;
const BATCH_SIZE = 200;
const QUERY_TIMEOUT_MS = 60_000;

/**
 * Deterministic session token per user index.
 * Must match the logic in the Artillery auth processor.
 */
export function sessionToken(index: number): string {
  return `xbench-session-token-${String(index).padStart(12, '0')}`;
}

/** SHA-256 hex lowercase — same as backend's encodeLowerCased (oslojs). */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

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

function printStep(label: string, detail?: string) {
  const msg = detail ? `${label} ${pc.dim(detail)}` : label;
  console.info(`  ${pc.green('✓')} ${msg}`);
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Insert rows in batches to avoid exceeding Postgres parameter limits.
 */
async function batchInsert(
  pool: pg.Pool,
  table: string,
  columns: string[],
  rows: unknown[][],
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    const valueClauses: string[] = [];
    const params: unknown[] = [];

    for (let r = 0; r < batch.length; r++) {
      const row = batch[r];
      const placeholders = row.map((_, c) => `$${r * columns.length + c + 1}`);
      valueClauses.push(`(${placeholders.join(', ')})`);
      params.push(...row);
    }

    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${valueClauses.join(', ')} ON CONFLICT DO NOTHING`;
    await pool.query(sql, params);
  }
}

/**
 * Convert a camelCase record to a snake_case value array for SQL insertion.
 * Columns listed in `pgArrayColumns` are kept as native JS arrays (pg driver converts them).
 * All other arrays/objects are JSON-stringified for json/jsonb columns.
 */
function recordToRow(record: Record<string, unknown>, columns: string[], pgArrayColumns?: Set<string>): unknown[] {
  return columns.map((col) => {
    const key = col.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const value = record[key];
    if (value !== null && value !== undefined && typeof value === 'object' && !(value instanceof Date)) {
      // Keep native Postgres array columns as JS arrays — pg driver handles conversion
      if (Array.isArray(value) && pgArrayColumns?.has(col)) return value;
      return JSON.stringify(value);
    }
    return value ?? null;
  });
}

// ── Clean existing loadtest data ────────────────────────────────────────────

async function cleanLoadtestData(pool: pg.Pool) {
  startSpinner('cleaning existing bench data...');

  // Drop CDC replication slot if it exists — an unconsumed slot blocks DELETEs on published tables
  await pool.query(`SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots WHERE slot_name = 'cdc_slot'`).catch(() => {});

  // Disable FK trigger checks for this session — avoids expensive SET NULL cascades
  // across 19 FK constraints when deleting loadtest users (full-table scans on each)
  const client = await pool.connect();
  try {
    await client.query(`SET session_replication_role = 'replica'`);

    // Delete in reverse FK order — match 00000000-0000-4000-a UUID prefix (bench-specific)
    const tables = ['sessions', 'memberships', 'tasks', 'attachments', 'projects', 'organizations', 'emails', 'users'];
    for (const table of tables) {
      updateSpinner(`cleaning ${table}...`);
      await client.query(`DELETE FROM ${table} WHERE id::text LIKE '00000000-0000-4000-a%'`);
    }
    updateSpinner('cleaning activities...');
    await client.query(`DELETE FROM activities WHERE tenant_id = $1`, [TENANT_ID]);
    updateSpinner('cleaning tenants...');
    await client.query(`DELETE FROM tenants WHERE id = $1`, [TENANT_ID]);

    await client.query(`SET session_replication_role = 'origin'`);
  } finally {
    client.release();
  }
  succeedSpinner('existing bench data cleaned');
}

// ── Seed ───────────────────────────────────────────────────────────────────

async function seed() {
  const pool = new Pool({ connectionString: DB_URL, statement_timeout: QUERY_TIMEOUT_MS });

  try {
    startSpinner('connecting to database...');
    await pool.query('SELECT 1');
    succeedSpinner('connected to database');

    await cleanLoadtestData(pool);

    const now = new Date().toISOString();

    // ── 1. Users ───────────────────────────────────────────────────────
    startSpinner(`seeding ${pc.cyan(String(TOTAL_USERS))} users...`);
    const userColumns = ['id', 'entity_type', 'name', 'email', 'slug', 'language', 'newsletter', 'mfa_required', 'user_flags', 'created_at'];
    const userRows = Array.from({ length: TOTAL_USERS }, (_, i) =>
      recordToRow({ ...loadtestUser(i), createdAt: now }, userColumns),
    );
    await batchInsert(pool, 'users', userColumns, userRows);
    succeedSpinner(`${TOTAL_USERS} users inserted`);

    // ── 2. Emails ──────────────────────────────────────────────────────
    startSpinner(`seeding ${pc.cyan(String(TOTAL_USERS))} emails...`);
    const emailColumns = ['id', 'email', 'user_id', 'verified', 'verified_at', 'created_at'];
    const emailRows = Array.from({ length: TOTAL_USERS }, (_, i) =>
      recordToRow({ ...loadtestEmail(i), verifiedAt: now, createdAt: now }, emailColumns),
    );
    await batchInsert(pool, 'emails', emailColumns, emailRows);
    succeedSpinner(`${TOTAL_USERS} emails inserted`);

    // ── 3. Tenant ──────────────────────────────────────────────────────
    startSpinner('seeding tenant...');
    const restrictions = JSON.stringify({ quotas: {}, rateLimits: { apiPointsPerHour: 10_000_000 } });
    await pool.query(
      `INSERT INTO tenants (id, name, restrictions, created_at) VALUES ($1, $2, $3::jsonb, $4) ON CONFLICT (id) DO UPDATE SET restrictions = $3::jsonb`,
      [TENANT_ID, 'Load Test Tenant', restrictions, now],
    );
    succeedSpinner('tenant inserted (high rate limit)');

    // ── 4. Organization ────────────────────────────────────────────────
    startSpinner('seeding organization...');
    const orgColumns = ['id', 'entity_type', 'tenant_id', 'name', 'slug', 'default_language', 'languages', 'auth_strategies', 'chat_support', 'created_at'];
    const orgRow = recordToRow({ ...loadtestOrganization(), createdAt: now }, orgColumns);
    await batchInsert(pool, 'organizations', orgColumns, [orgRow]);
    succeedSpinner('organization inserted');

    // ── 5. Projects ────────────────────────────────────────────────────
    startSpinner(`seeding ${pc.cyan(String(TOTAL_PROJECTS))} projects...`);
    const projColumns = ['id', 'entity_type', 'tenant_id', 'name', 'slug', 'organization_id', 'public_at', 'created_at'];
    const projRows = Array.from({ length: TOTAL_PROJECTS }, (_, i) =>
      recordToRow({ ...loadtestProject(i), createdAt: now }, projColumns),
    );
    await batchInsert(pool, 'projects', projColumns, projRows);
    succeedSpinner(`${TOTAL_PROJECTS} projects inserted`);

    // ── 6. Tasks ───────────────────────────────────────────────────────
    startSpinner(`seeding ${pc.cyan(String(TOTAL_TASKS))} tasks...`);
    const taskColumns = [
      'id', 'entity_type', 'tenant_id', 'name', 'stx',
      'description', 'keywords', 'summary', 'summary_length',
      'variant', 'status', 'display_order', 'labels', 'assigned_to',
      'organization_id', 'project_id', 'created_by', 'seq', 'expandable',
      'checkbox_count', 'checked_count', 'created_at',
    ];
    const taskPgArrays = new Set(['labels', 'assigned_to']);
    const taskRows = Array.from({ length: TOTAL_TASKS }, (_, i) =>
      recordToRow({ ...loadtestTask(i), createdAt: now, seq: 0 }, taskColumns, taskPgArrays),
    );
    await batchInsert(pool, 'tasks', taskColumns, taskRows);
    succeedSpinner(`${TOTAL_TASKS} tasks inserted`);

    // ── 8b. Attachments ────────────────────────────────────────────────
    startSpinner(`seeding ${pc.cyan(String(TOTAL_ATTACHMENTS))} attachments...`);
    const attachColumns = [
      'id', 'entity_type', 'tenant_id', 'name', 'stx',
      'description', 'keywords', 'public', 'bucket_name', 'group_id',
      'filename', 'content_type', 'converted_content_type', 'size',
      'original_key', 'converted_key', 'thumbnail_key',
      'organization_id', 'project_id', 'created_by', 'seq', 'created_at',
    ];
    const attachRows = Array.from({ length: TOTAL_ATTACHMENTS }, (_, i) =>
      recordToRow({ ...loadtestAttachment(i), createdAt: now, seq: 0 }, attachColumns),
    );
    await batchInsert(pool, 'attachments', attachColumns, attachRows);
    succeedSpinner(`${TOTAL_ATTACHMENTS} attachments inserted`);

    // ── 7. Memberships ─────────────────────────────────────────────────
    const totalProjectMemberships = TOTAL_USERS * TOTAL_PROJECTS;
    startSpinner(`seeding ${pc.cyan(String(TOTAL_USERS))} org + ${pc.cyan(String(totalProjectMemberships))} project memberships...`);
    const membColumns = [
      'id', 'tenant_id', 'context_type', 'context_id', 'user_id', 'role',
      'created_by', 'display_order', 'organization_id', 'project_id', 'archived', 'muted',
      'created_at',
    ];
    const membRows: unknown[][] = [];
    for (let i = 0; i < TOTAL_USERS; i++) {
      membRows.push(recordToRow({ ...loadtestOrgMembership(i), createdAt: now }, membColumns));
      for (const projMemb of loadtestProjectMemberships(i)) {
        membRows.push(recordToRow({ ...projMemb, createdAt: now }, membColumns));
      }
    }
    await batchInsert(pool, 'memberships', membColumns, membRows);
    succeedSpinner(`${TOTAL_USERS} org + ${totalProjectMemberships} project memberships inserted`);

    // ── 8. Sessions ────────────────────────────────────────────────────
    startSpinner(`seeding ${pc.cyan(String(TOTAL_USERS))} sessions...`);
    const sessColumns = ['id', 'secret', 'type', 'user_id', 'device_type', 'device_name', 'device_os', 'browser', 'auth_strategy', 'expires_at'];
    const sessExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const sessRows = Array.from({ length: TOTAL_USERS }, (_, i) => {
      const token = sessionToken(i);
      const hashed = hashToken(token);
      return recordToRow(loadtestSession(i, hashed, sessExpires), sessColumns);
    });
    await batchInsert(pool, 'sessions', sessColumns, sessRows);
    succeedSpinner(`${TOTAL_USERS} sessions inserted`);

    console.info(`\n${pc.green('✓')} Seed completed successfully.`);
  } catch (err) {
    failSpinner('seed step failed');
    throw err;
  } finally {
    await pool.end();
  }
}

// ── Teardown ───────────────────────────────────────────────────────────────

async function teardown() {
  const pool = new Pool({ connectionString: DB_URL, statement_timeout: QUERY_TIMEOUT_MS });

  try {
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
