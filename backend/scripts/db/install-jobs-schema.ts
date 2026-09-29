import { sql } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import pc from 'picocolors';
import { appConfig } from 'shared';
import { sleep } from 'shared/utils/sleep';
import { getAdminDb } from '#/db/db';
import { env } from '#/env';
import { ensureQueues } from '#/lib/jobs';
import { JOBS_SCHEMA, jobsOptions } from '#/lib/pg-boss';
import '#/modules'; // composition root: the queues to create are declared on the modules
import { durationSuffix, timestamp } from '#/utils/console';
import { jobsGrantsSql } from '../migrations/10-jobs.migration';

/** Ceiling for the index builds a pg-boss upgrade runs in the background before this returns. */
const BAM_WAIT_MS = 10 * 60 * 1000;

/** Waits for pg-boss's background index builds (part of a schema upgrade) so the owner finishes them here, not a runtime role later. */
async function waitForBackgroundMigrations(boss: PgBoss): Promise<void> {
  const deadline = Date.now() + BAM_WAIT_MS;
  for (;;) {
    const summary = await boss.getBamStatus();
    const failed = summary.find((row) => row.status === 'failed');
    if (failed) throw new Error(`pg-boss background migration failed: ${JSON.stringify(failed)}`);
    const busy = boss.isBamWorking() || summary.some((row) => row.status === 'pending' || row.status === 'in_progress');
    if (!busy) return;
    if (Date.now() > deadline) throw new Error('pg-boss background migrations did not finish in time');
    await sleep(1000);
  }
}

/**
 * Installs or upgrades the job store as the table owner (admin DSN), grants the runtime role,
 * and creates every declared queue, so runtime processes only ever need `migrate: false`. Runs
 * after the schema migrations: from the migrate companion, `pnpm migrate`, and the API's boot
 * path in development. Idempotent.
 */
export async function installJobsSchema(): Promise<void> {
  if (!env.DATABASE_ADMIN_URL) throw new Error('DATABASE_ADMIN_URL is required to install the job store');
  const startedAt = performance.now();

  const boss = new PgBoss(
    jobsOptions('producer', {
      connectionString: env.DATABASE_ADMIN_URL,
      application_name: `${appConfig.slug}-jobs-install`,
      migrate: true,
      createSchema: true,
      useListenNotify: false,
    }),
  );
  boss.on('error', (err) => console.error(`${timestamp()} [jobs] pg-boss error: ${err.message}`));
  await boss.start();
  try {
    await waitForBackgroundMigrations(boss);
    await getAdminDb('job store grants').execute(sql.raw(jobsGrantsSql(JOBS_SCHEMA)));
    await ensureQueues(boss);
    const queues = (await boss.getQueues()).length;
    console.info(`${timestamp()} ${pc.green('✔')} Job store ready: schema ${JOBS_SCHEMA}, ${queues} queues${durationSuffix(startedAt)}`);
  } finally {
    await boss.stop({ graceful: true, timeout: 5_000 });
  }
}
