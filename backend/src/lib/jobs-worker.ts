import { type ServerType, serve } from '@hono/node-server';
import { appConfig } from 'shared';
import { sleep } from 'shared/utils/sleep';
import { waitForBackend } from 'shared/utils/wait-for-backend';
import { setupGracefulShutdown } from 'shared/utils/worker-lifecycle';
import { env } from '#/env';
import { healthApp } from '#/lib/health';
import { ensureQueues, scheduleJobs, validateJobDeclarations, workDeclared } from '#/lib/jobs';
import { getBackendJobs, getBackendQueues } from '#/lib/module';
import { getPgBoss, stopPgBoss } from '#/lib/pg-boss';
import { baseLog } from '#/lib/pino';
import { otel } from '#/lib/tracing';
import '#/modules'; // composition root: registers every backend module, whose jobs and queues this worker runs

/** How long the worker waits for the migrate companion to install the job store before giving up. */
const installWaitMs = 5 * 60 * 1000;
const installPollMs = 5_000;

/** Time until a run, as coarse as a startup line needs: 43m, 5h 43m, 2d 5h. */
function timeUntil(at: Date): string {
  const minutes = Math.max(1, Math.ceil((at.getTime() - Date.now()) / 60_000));
  const [days, hours, mins] = [Math.floor(minutes / 1440), Math.floor((minutes % 1440) / 60), minutes % 60];
  if (days) return `${days}d ${hours}h`;
  return hours ? `${hours}h ${mins}m` : `${mins}m`;
}

/** Starts the maintainer instance, waiting out a store that a companion is still installing or upgrading. */
async function startMaintainer() {
  const deadline = Date.now() + installWaitMs;
  for (;;) {
    try {
      return await getPgBoss('maintainer');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const installing = message.includes('not installed') || message.includes('requires migrations');
      if (!installing || Date.now() > deadline) throw error;
      baseLog.warn(`jobs: job store not ready (${message}), retrying in ${installPollMs / 1000}s`);
      await sleep(installPollMs);
    }
  }
}

/**
 * The jobs worker: the one process per deployment that runs pg-boss cron and supervision, works
 * the template's queues and creates queues declared by modules. Its own process (`MODE=jobs`) on
 * `devPorts.jobs`, or folded into the API under `singleVM`, where the API's `/health` already
 * carries the jobs component and its shutdown stops the store.
 */
export async function startJobsWorker(options: { port?: number; inProcess?: boolean } = {}): Promise<void> {
  if (!appConfig.services.jobs.enabled) {
    baseLog.info('Jobs worker disabled by appConfig');
    return;
  }
  const port = options.port ?? env.PORT;

  if (!options.inProcess) {
    otel.start();
    otel.verifyConnection();
    // The API installs the job store at boot in development; production installs it from the migrate companion.
    if (env.NODE_ENV === 'development') await waitForBackend(2000, 60_000, appConfig.devPorts.api);
  }

  const boss = await startMaintainer();
  validateJobDeclarations((cron) => boss.previewSchedule(cron, { count: 1 }));
  await ensureQueues(boss);
  await scheduleJobs(boss);
  await workDeclared(boss);

  const nextRuns = getBackendJobs()
    .map((job) => ({ name: job.name, at: boss.previewSchedule(job.cron, { count: 1 })[0] }))
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((run) => `${run.name} in ${timeUntil(run.at)}`);
  const queues = getBackendQueues().map((queue) => `${queue.name}${queue.handler ? '' : ' (worked elsewhere)'}`);
  const scheduled = nextRuns.length ? `${nextRuns.length} periodic jobs, next runs: ${nextRuns.join(', ')}` : 'no periodic jobs';
  baseLog.info(`Jobs worker: ${scheduled}${queues.length ? `; working queues: ${queues.join(', ')}` : ''}`);

  let server: ServerType | undefined;
  if (!options.inProcess) {
    server = serve({ fetch: healthApp.fetch, hostname: '0.0.0.0', port }, () => {
      baseLog.info(`Jobs worker listening on port ${port}`);
    });
    setupGracefulShutdown({
      name: 'jobs',
      cleanup: async () => {
        server?.close();
        await stopPgBoss();
        await otel.shutdown();
      },
      log: (msg) => baseLog.info(msg),
    });
  }
}
