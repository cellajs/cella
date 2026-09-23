import { sql } from 'drizzle-orm';
import { getAdminDb, getAdminDbFor } from '#/db/db';
import { env } from '#/env';

/** pg_cron job name; pg_cron upserts on it, so every migrate run converges on one job. */
export const PARTITION_MAINTENANCE_JOB = 'partition-maintenance';

/**
 * Registers `CALL maintain_partitions()` as a nightly pg_cron job. pg_cron keeps its jobs in one
 * database per cluster (`cron.database_name`: `rdb` on Scaleway, `postgres` in the dev image), so
 * the job is scheduled from there and pointed at this database; it runs as the admin user that
 * schedules it. Throws when pg_cron is not loaded: without the job, partitions are neither
 * created ahead nor dropped, which is the silent failure this replaces.
 */
export async function schedulePartitionMaintenance(): Promise<void> {
  const db = getAdminDb('partition maintenance job');
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
    await cronDb.execute(
      sql`SELECT cron.schedule_in_database(${PARTITION_MAINTENANCE_JOB}, '15 3 * * *', 'CALL public.maintain_partitions()', ${appDatabase})`,
    );
  } finally {
    await cronDb.$client.end();
  }
}
