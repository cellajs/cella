import { sql } from 'drizzle-orm';
import pc from 'picocolors';
import { getAdminDb, getAdminDbFor } from '#/db/db';
import { env } from '#/env';
import { extractPgError } from '#/lib/error';

/** pg_cron job name; pg_cron upserts on it, so every migrate run converges on one job. */
const retentionJob = 'apply-retention';

/** The job name the procedure ran under as `maintain_partitions()`; unscheduled when found. */
const retiredJob = 'partition-maintenance';

/** SQLSTATE `insufficient_privilege`: a setting, schema or function the admin role may not use. */
const insufficientPrivilegeState = '42501';

/**
 * The database pg_cron keeps its jobs in: `PG_CRON_DATABASE` when set, else the `cron.database_name` setting.
 * @returns The name, or null when the setting is unknown because pg_cron is not loaded.
 * @throws When the admin role may not read the setting, naming `PG_CRON_DATABASE` as the way out.
 */
async function cronHomeDatabase(): Promise<string | null> {
  if (env.PG_CRON_DATABASE) return env.PG_CRON_DATABASE;
  const db = getAdminDb('retention job');
  try {
    const { rows } = await db.execute<{ name: string | null }>(sql`SELECT current_setting('cron.database_name', true) AS name`);
    return rows[0]?.name ?? null;
  } catch (error) {
    if (extractPgError(error)?.code !== insufficientPrivilegeState) throw error;
    throw new Error(
      'This admin role may not read cron.database_name, a superuser-only setting: set PG_CRON_DATABASE to the database pg_cron runs in',
      { cause: error },
    );
  }
}

/**
 * Registers `CALL apply_retention()` as a nightly pg_cron job. pg_cron keeps its jobs in one database per cluster, so
 * the job is scheduled from there and pointed at this database; it runs as the admin user that schedules it. Without
 * the job, partitions are neither created ahead nor dropped and no row ever ages out. Throws when pg_cron is not
 * loaded; warns and returns when the admin role may not use pg_cron, a right only the database provider grants.
 */
export async function scheduleRetention(): Promise<void> {
  const cronDatabase = await cronHomeDatabase();
  if (!cronDatabase) {
    throw new Error(
      'pg_cron is not loaded: add pg_cron to shared_preload_libraries (dev: rebuild the db image with `pnpm docker`)',
    );
  }

  const adminUrl = new URL(env.DATABASE_ADMIN_URL ?? '');
  const appDatabase = adminUrl.pathname.slice(1);
  const cronDb = getAdminDbFor(cronDatabase);
  try {
    await cronDb.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_cron`);
    await cronDb.execute(sql`SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = ${retiredJob} AND database = ${appDatabase}`);
    await cronDb.execute(sql`SELECT cron.schedule_in_database(${retentionJob}, '15 3 * * *', 'CALL public.apply_retention()', ${appDatabase})`);
  } catch (error) {
    if (extractPgError(error)?.code !== insufficientPrivilegeState) throw error;
    const role = decodeURIComponent(adminUrl.username);
    console.warn(
      pc.yellow(
        `Retention job not scheduled: role ${role} may not use pg_cron in database ${cronDatabase}. Until the database provider grants it USAGE on schema cron and EXECUTE on its functions, apply_retention() never runs: no partition is created ahead or dropped and no aged row is removed.`,
      ),
    );
  } finally {
    await cronDb.$client.end();
  }
}
