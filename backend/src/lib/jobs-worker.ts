import { type ServerType, serve } from '@hono/node-server';
import { appConfig } from 'shared';
import { createHealthApp } from 'shared/health-app';
import { sleep } from 'shared/utils/sleep';
import { waitForBackend } from 'shared/utils/wait-for-backend';
import { setupGracefulShutdown } from 'shared/utils/worker-lifecycle';
import { env } from '#/env';
import { getHealthResponse } from '#/lib/health';
import { ensureQueues, scheduleJobs, validateJobDeclarations, workDeclared } from '#/lib/jobs';
import { getBackendJobs, getBackendQueues } from '#/lib/module';
import { getPgBoss, stopPgBoss } from '#/lib/pg-boss';
import { baseLog } from '#/lib/pino';
import { otel } from '#/lib/tracing';
import '#/modules'; // composition root: registers every backend module, whose jobs and queues this worker runs

/** How long the worker waits for the migrate companion to install the job store before giving up. */
const INSTALL_WAIT_MS = 5 * 60 * 1000;
const INSTALL_POLL_MS = 5_000;

/** Starts the maintainer instance, waiting out a store that a companion is still installing or upgrading. */
async function startMaintainer() {
  const deadline = Date.now() + INSTALL_WAIT_MS;
  for (;;) {
    try {
      return await getPgBoss('maintainer');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const installing = message.includes('not installed') || message.includes('requires migrations');
      if (!installing || Date.now() > deadline) throw error;
      baseLog.warn(`jobs: job store not ready (${message}), retrying in ${INSTALL_POLL_MS / 1000}s`);
      await sleep(INSTALL_POLL_MS);
    }
  }
}

/**
 * The jobs service: the one process per deployment that runs pg-boss cron and supervision, works
 * the template's queues and creates queues declared by modules. Its own process (`MODE=jobs`) on
 * `devPorts.jobs`, or folded into the API under `singleVM`, where the API's `/health` already
 * carries the jobs component and its shutdown stops the store.
 */
export async function startJobsWorker(options: { port?: number; inProcess?: boolean } = {}): Promise<void> {
  if (appConfig.services.jobs.enabled === false) {
    baseLog.info('Jobs service disabled by appConfig');
    return;
  }
  const port = options.port ?? Number(env.PORT);

  if (!options.inProcess) {
    otel.start();
    otel.verifyConnection();
    // The API installs the job store at boot in development; production installs it from the migrate companion.
    if (env.NODE_ENV === 'development') await waitForBackend(2000, 60_000);
  }

  const boss = await startMaintainer();
  validateJobDeclarations((cron) => boss.previewSchedule(cron, { count: 1 }));
  await ensureQueues(boss);
  await scheduleJobs(boss);
  await workDeclared(boss);

  const jobs = getBackendJobs().map((job) => `${job.name} (${job.cron})`);
  const queues = getBackendQueues().map((queue) => `${queue.name}${queue.handler ? '' : ' (no handler here)'}`);
  baseLog.info(`jobs: scheduling ${jobs.join(', ') || 'no cron jobs'}; queues: ${queues.join(', ') || 'none'}`);

  let server: ServerType | undefined;
  if (!options.inProcess) {
    const healthApp = createHealthApp({
      version: env.RELEASE_SHA,
      full: async () => {
        const { response, httpStatus } = await getHealthResponse();
        return { httpStatus, body: { ...response, version: env.RELEASE_SHA } };
      },
    });
    server = serve({ fetch: healthApp.fetch, hostname: '0.0.0.0', port }, () => {
      baseLog.info(`Jobs service listening on port ${port}`);
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
