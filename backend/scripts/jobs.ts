import process from 'node:process';
import { sql } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import pc from 'picocolors';
import { baseDb } from '#/db/db';
import { declaredQueues } from '#/lib/jobs';
import { readJobsHealth } from '#/lib/jobs-health';
import { JOBS_SCHEMA, jobsOptions } from '#/lib/pg-boss';
import '#/modules'; // composition root: the declared queues and jobs to compare the store against

/**
 * `pnpm jobs [--json]`: what the job store holds, for an operator without SQL. Queues with their
 * live depth, the schedules and when each last fired, the last failures with their error, pg-boss
 * warnings, and the index rebuilds an owner could run. Reads as the runtime role.
 */

interface FailureRow extends Record<string, unknown> {
  name: string;
  id: string;
  completed_on: Date | null;
  output: { message?: string } | null;
}

interface WarningRow extends Record<string, unknown> {
  type: string;
  message: string;
  created_on: Date;
}

const ago = (ms: number | null): string => {
  if (ms === null) return '-';
  const minutes = Math.round(ms / 60_000);
  return minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`;
};

async function main(): Promise<void> {
  const json = process.argv.includes('--json');
  const snapshot = await readJobsHealth();
  if (!snapshot.installed) {
    console.error(`Job store schema ${JOBS_SCHEMA} is not installed: run \`pnpm migrate\` (or boot the API in development).`);
    process.exit(1);
  }

  const boss = new PgBoss(jobsOptions('producer', { useListenNotify: false }));
  await boss.start();
  const schema = sql.raw(JOBS_SCHEMA);
  try {
    const schedules = await boss.getSchedules();
    const reindex = await boss.getReindexCommands();
    const { rows: failures } = await baseDb.execute<FailureRow>(sql`
      SELECT name, id, completed_on, output FROM ${schema}.job
      WHERE state = 'failed' ORDER BY completed_on DESC NULLS LAST LIMIT 10`);
    const { rows: warnings } = await baseDb.execute<WarningRow>(sql`
      SELECT type, message, created_on FROM ${schema}.warning ORDER BY created_on DESC LIMIT 5`);
    const declared = new Set(declaredQueues().map((queue) => queue.name));

    if (json) {
      console.info(JSON.stringify({ ...snapshot, schedules, failures, warnings, reindex }, null, 2));
      return;
    }

    console.info(pc.bold(`Job store ${JOBS_SCHEMA}`), `scheduler last ran ${ago(snapshot.cronAgeMs)} ago`);
    console.info('');
    console.info(pc.bold('Queues'));
    for (const queue of snapshot.queues) {
      const flags = [
        declared.has(queue.name) ? '' : pc.yellow('undeclared'),
        queue.deadLetterDepth ? pc.red(`${queue.deadLetterDepth} dead`) : '',
        queue.warningQueueSize !== null && queue.queued > queue.warningQueueSize ? pc.red('backlog') : '',
      ].filter(Boolean);
      console.info(
        `  ${queue.name.padEnd(32)} ${queue.policy.padEnd(10)} queued ${String(queue.queued).padStart(4)}  active ${String(queue.active).padStart(3)}  failed/1h ${String(queue.failedLastHour).padStart(3)}  oldest ${ago(queue.oldestQueuedAgeMs).padStart(4)}  ${flags.join(' ')}`,
      );
    }
    console.info('');
    console.info(pc.bold('Schedules'));
    for (const schedule of schedules) {
      console.info(`  ${schedule.name.padEnd(32)} ${schedule.cron.padEnd(14)} ${schedule.timezone}  last job ${schedule.lastJobId ?? '-'}`);
    }
    if (failures.length) {
      console.info('');
      console.info(pc.bold('Last failures'));
      for (const failure of failures) {
        const when = failure.completed_on ? new Date(failure.completed_on).toISOString() : '-';
        console.info(`  ${when}  ${failure.name}  ${pc.dim(failure.id)}  ${failure.output?.message ?? ''}`);
      }
    }
    if (warnings.length) {
      console.info('');
      console.info(pc.bold('Warnings'));
      for (const warning of warnings) {
        console.info(`  ${new Date(warning.created_on).toISOString()}  ${warning.type}  ${warning.message}`);
      }
    }
    if (reindex.length) {
      console.info('');
      console.info(pc.bold('Index rebuilds (run as the table owner)'));
      for (const command of reindex) console.info(`  ${command}`);
    }
  } finally {
    await boss.stop({ graceful: true, timeout: 3_000 });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(pc.red(`jobs: ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  });
