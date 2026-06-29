/**
 * Database maintenance: expired token/session/activity cleanup.
 *
 * Two modes, chosen automatically:
 * 1. With pg_partman (production): runs partman.run_maintenance() to drop old partitions.
 * 2. Without pg_partman (dev / non-Neon): runs manual DELETE queries for expired data.
 *
 * Exposed as a reusable function so it can be invoked from:
 * - the CLI script `scripts/db-maintenance.ts` (external scheduler), and
 * - the in-process scheduler (`scheduleDbMaintenance`) started on the migration-owning instance.
 *
 * Both DELETE and partman.run_maintenance() are idempotent, so overlapping runs are harmless.
 */
import { sql } from 'drizzle-orm';
import { baseDb as db } from '#/db/db';

/** Check if the pg_partman extension is installed. */
async function isPgPartmanAvailable(): Promise<boolean> {
  try {
    const result = await db.execute<{ exists: boolean }>(
      sql`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_partman') as exists`,
    );
    return result.rows[0]?.exists ?? false;
  } catch {
    return false;
  }
}

/** Run pg_partman maintenance for all configured partition sets (drops partitions past retention). */
async function runPartmanMaintenance(log: (msg: string) => void): Promise<void> {
  log('Running pg_partman maintenance...');
  await db.execute(sql`SELECT partman.run_maintenance()`);
  log('pg_partman maintenance completed');
}

/**
 * Manual cleanup for environments without pg_partman.
 * Deletes expired tokens and sessions based on their expiration/creation timestamps.
 */
async function runManualCleanup(log: (msg: string) => void): Promise<void> {
  log('Running manual cleanup (pg_partman not available)...');

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Delete expired tokens (30-day buffer after expiration)
  const tokensResult = await db.execute<{ count: string }>(
    sql`DELETE FROM tokens WHERE expires_at < ${thirtyDaysAgo} RETURNING 1`,
  );
  log(`Deleted ${tokensResult.rowCount ?? 0} expired tokens`);

  // Delete expired sessions (30-day buffer after expiration)
  const sessionsResult = await db.execute<{ count: string }>(
    sql`DELETE FROM sessions WHERE expires_at < ${thirtyDaysAgo} RETURNING 1`,
  );
  log(`Deleted ${sessionsResult.rowCount ?? 0} expired sessions`);

  // Delete old unsubscribe tokens (90-day retention)
  const unsubscribeResult = await db.execute<{ count: string }>(
    sql`DELETE FROM unsubscribe_tokens WHERE created_at < ${ninetyDaysAgo} RETURNING 1`,
  );
  log(`Deleted ${unsubscribeResult.rowCount ?? 0} old unsubscribe tokens`);

  // Delete old seen_by records (90-day retention)
  const seenByResult = await db.execute<{ count: string }>(
    sql`DELETE FROM seen_by WHERE created_at < ${ninetyDaysAgo} RETURNING 1`,
  );
  log(`Deleted ${seenByResult.rowCount ?? 0} old seen_by records`);

  // Delete orphaned seen_counts where no recent seen_by references exist
  const seenCountsResult = await db.execute<{ count: string }>(
    sql`DELETE FROM seen_counts WHERE updated_at < ${ninetyDaysAgo} RETURNING 1`,
  );
  log(`Deleted ${seenCountsResult.rowCount ?? 0} old seen_counts records`);

  log('Manual cleanup completed');
}

/**
 * Run a single database maintenance pass. Picks partman or manual cleanup automatically.
 *
 * @param log - Optional log sink (defaults to console.info). Throws on failure; callers decide how to handle it.
 */
export async function runDbMaintenance(log: (msg: string) => void = console.info): Promise<void> {
  const hasPartman = await isPgPartmanAvailable();

  if (hasPartman) {
    log('pg_partman detected - using partition management');
    await runPartmanMaintenance(log);
  } else {
    log('pg_partman not available - using manual cleanup');
    await runManualCleanup(log);
  }
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
      console.error('[db-maintenance] scheduled run failed:', error instanceof Error ? error.message : error);
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
