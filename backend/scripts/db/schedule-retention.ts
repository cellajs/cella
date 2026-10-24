import { sql } from 'drizzle-orm';
import { getAdminDb, getAdminDbFor } from '#/db/db';
import { env } from '#/env';

/** pg_cron job name; pg_cron upserts on it, so every migrate run converges on one job. */
const retentionJob = 'apply-retention';

/** The job name the procedure ran under as `maintain_partitions()`; unscheduled when found. */
const retiredJob = 'partition-maintenance';

/**
 * Registers `CALL apply_retention()` as a nightly pg_cron job. pg_cron keeps its jobs in one
 * database per cluster (`cron.database_name`: `rdb` on Scaleway, `postgres` in the dev image), so
 * the job is scheduled from there and pointed at this database; it runs as the admin user that
 * schedules it. Throws when pg_cron is not loaded: without the job, partitions are neither
 * created ahead nor dropped and no row ever ages out.
 */
export async function scheduleRetention(): Promise<void> {
  const db = getAdminDb('retention job');
  const { rows } = await db.execute<{ name: string | null }>(sql`SELECT current_setting('cron.database_name', true) AS name`);
  const cronDatabase = rows[0]?.name;
  if (!cronDatabase) {
    throw new Error(
      'pg_cron is not loaded: add pg_cron to shared_preload_libraries (dev: rebuild the db image with `pnpm docker`)',
    );
  }

  const appDatabase = new URL(env.DATABASE_ADMIN_URL ?? '').pathname.slice(1);
  const cronDb = getAdminDbFor(cronDatabase);
  try {
    await cronDb.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_cron`);
    await cronDb.execute(sql`SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = ${retiredJob} AND database = ${appDatabase}`);
    await cronDb.execute(sql`SELECT cron.schedule_in_database(${retentionJob}, '15 3 * * *', 'CALL public.apply_retention()', ${appDatabase})`);
  } finally {
    await cronDb.$client.end();
  }
}
