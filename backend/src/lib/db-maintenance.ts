import { sql } from 'drizzle-orm';
import { type PgDB, unsafeInternalAdminDb } from '#/db/db';
import { baseLog } from '#/lib/pino';

/** Check if the pg_partman extension is installed. */
async function isPgPartmanAvailable(db: PgDB): Promise<boolean> {
  try {
    const result = await db.execute<{ exists: boolean }>(
      sql`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_partman') as exists`,
    );
    return result.rows[0]?.exists ?? false;
  } catch {
    return false;
  }
}

/**
 * Run a single pg_partman maintenance pass (creates upcoming partitions, drops expired ones).
 * Skips with a warning when the pg_partman extension is not installed.
 *
 * Runs on the admin connection: run_maintenance() creates and drops partition tables,
 * which requires ownership of the parent tables — beyond runtime_role's grants.
 *
 * @param log - Optional log sink (defaults to console.info). Throws on failure; callers decide how to handle it.
 */
export async function runDbMaintenance(log: (msg: string) => void = console.info): Promise<void> {
  const db = unsafeInternalAdminDb;
  if (!db) {
    log('no admin db connection - skipping maintenance');
    return;
  }

  if (!(await isPgPartmanAvailable(db))) {
    log('pg_partman not installed - skipping maintenance (partitioned tables will not be reaped)');
    return;
  }

  log('Running pg_partman maintenance...');
  await db.execute(sql`SELECT partman.run_maintenance()`);
  log('pg_partman maintenance completed');
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Start an in-process daily scheduler that runs {@link runDbMaintenance}.
 *
 * Gated by the caller to a single instance (the migration owner) to avoid redundant runs,
 * though the underlying operations are idempotent. Failures are logged and swallowed so a
 * transient DB hiccup never crashes the server.
 *
 * @returns A stop function that clears the interval.
 */
export function scheduleDbMaintenance(intervalMs: number = ONE_DAY_MS): () => void {
  const run = () => {
    runDbMaintenance().catch((error) => {
      baseLog.error('db-maintenance scheduled run failed', { err: error });
    });
  };

  // Defer the first run so it never competes with boot-time migrations.
  const startTimer = setTimeout(run, Math.min(intervalMs, 60 * 60 * 1000));
  const interval = setInterval(run, intervalMs);
  if (typeof interval.unref === 'function') interval.unref();
  if (typeof startTimer.unref === 'function') startTimer.unref();

  return () => {
    clearTimeout(startTimer);
    clearInterval(interval);
  };
}
