import { sql } from 'drizzle-orm';
import { type PgDB, unsafeInternalAdminDb } from '#/db/db';
import { type BackendJob, registerBackendJob } from '#/lib/module';
import { baseLog } from '#/lib/pino';

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
 * Runs one pg_partman pass on the admin connection: run_maintenance() creates and drops partition tables, which
 * needs ownership of the parents and exceeds runtime_role's grants. Warns and skips when the extension is missing.
 * @param log - Optional log sink (defaults to console.info). Throws on failure.
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
 * Daily in-process scheduler for {@link runDbMaintenance}, gated by the caller to the migration owner instance.
 * Failures are logged and absorbed. Returns a stop function that clears the interval.
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

/** Registered on import; the API entrypoint starts every registered job on the migration-owning instance. */
export const dbMaintenanceJob: BackendJob = { name: 'db-maintenance', start: () => scheduleDbMaintenance() };
registerBackendJob(dbMaintenanceJob);
