import type { PgBoss, Queue } from 'pg-boss';
import { type BackendJob, type BackendQueue, getBackendJobs, getBackendQueues } from '#/lib/module';
import { baseLog } from '#/lib/pino';

/** Queue options a cron job's singleton queue is created with; `expireInSeconds` comes from the job. */
const cronQueueOptions = (job: BackendJob): Omit<Queue, 'name'> => ({
  policy: 'singleton',
  retryLimit: 0,
  ...(job.expireInSeconds ? { expireInSeconds: job.expireInSeconds } : {}),
});

/** The registry by default; tests pass their own. */
export interface JobDeclarations {
  jobs?: readonly BackendJob[];
  queues?: readonly BackendQueue[];
}

/** Every declared queue plus the singleton queue behind each cron job, as pg-boss queue definitions. */
export function declaredQueues({
  jobs = getBackendJobs(),
  queues = getBackendQueues(),
}: JobDeclarations = {}): Array<{ name: string; options: Omit<Queue, 'name'> }> {
  const plain = queues.map(({ name, handler: _handler, work: _work, ...options }) => ({ name, options }));
  const cron = jobs.map((job) => ({ name: job.name, options: cronQueueOptions(job) }));
  return [...plain, ...cron];
}

/**
 * Checks the declarations once per process: unique names, every dead-letter target declared, cron
 * expressions the scheduler accepts. Runs on the jobs service at start and in the unit test, so a
 * bad declaration fails before anything is created.
 * @param preview - Validates one cron expression by evaluating it (pg-boss's `previewSchedule`).
 */
export function validateJobDeclarations(
  preview: (cron: string) => unknown,
  { jobs = getBackendJobs(), queues = getBackendQueues() }: JobDeclarations = {},
): void {
  const declared = declaredQueues({ jobs, queues });
  const names = new Set<string>();
  for (const { name } of declared) {
    if (names.has(name)) throw new Error(`jobs: "${name}" is declared twice (a queue and a job share one namespace)`);
    names.add(name);
  }
  for (const { name, options } of declared) {
    if (options.deadLetter && !names.has(options.deadLetter)) {
      throw new Error(`jobs: queue "${name}" dead-letters to "${options.deadLetter}", which is not declared`);
    }
  }
  for (const job of jobs) {
    try {
      preview(job.cron);
    } catch (error) {
      throw new Error(`jobs: "${job.name}" has an invalid cron "${job.cron}": ${(error as Error).message}`);
    }
  }
}

/**
 * Creates every declared queue that is missing and converges the options of the ones that exist,
 * dead-letter targets first because pg-boss requires them to exist. Creating a partitioned queue
 * needs the table owner (the admin DSN of the migrate companion); as the runtime role the
 * error surfaces here, so the service never runs without a declared queue.
 */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  const queues = declaredQueues();
  const existing = new Map((await boss.getQueues()).map((queue) => [queue.name, queue]));
  const ordered = [...queues.filter((q) => !q.options.deadLetter), ...queues.filter((q) => q.options.deadLetter)];
  for (const { name, options } of ordered) {
    const current = existing.get(name);
    if (!current) {
      await boss.createQueue(name, options);
      baseLog.info(`jobs: created queue ${name}`, { policy: options.policy ?? 'standard' });
      continue;
    }
    if (current.partition !== (options.partition ?? false) || current.policy !== (options.policy ?? 'standard')) {
      throw new Error(`jobs: queue "${name}" cannot change policy or partitioning after creation; delete it first`);
    }
    // Every retry, expiry, retention and warning option converges; policy and partitioning are fixed at creation.
    const { partition: _partition, policy: _policy, ...updatable } = options;
    await boss.updateQueue(name, { ...updatable, deadLetter: options.deadLetter ?? null });
  }
}

/**
 * Upserts one schedule per cron job (UTC, a missed period sends one catch-up job) and removes
 * schedules no declared job owns, so a renamed job never keeps firing under its old name.
 */
export async function scheduleJobs(boss: PgBoss): Promise<void> {
  const jobs = getBackendJobs();
  const declared = new Set(jobs.map((job) => job.name));
  for (const job of jobs) {
    await boss.schedule(job.name, job.cron, null, { tz: 'UTC', missed: 'once' });
  }
  for (const schedule of await boss.getSchedules()) {
    if (declared.has(schedule.name)) continue;
    await boss.unschedule(schedule.name, schedule.key);
    baseLog.warn(`jobs: removed schedule for undeclared job ${schedule.name}`);
  }
}

/** Registers a worker for every cron job and every queue with a handler; failures are logged and fail the job. */
export async function workDeclared(boss: PgBoss): Promise<void> {
  for (const job of getBackendJobs()) {
    await boss.work(job.name, async () => {
      const startedAt = Date.now();
      try {
        await job.run();
        baseLog.info(`jobs: ${job.name} completed`, { ms: Date.now() - startedAt });
      } catch (error) {
        baseLog.error(`jobs: ${job.name} failed`, { err: error, ms: Date.now() - startedAt });
        throw error;
      }
    });
  }
  for (const queue of getBackendQueues()) {
    if (!queue.handler) continue;
    await boss.work(queue.name, queue.work ?? {}, workHandler(queue));
  }
}

function workHandler(queue: BackendQueue): NonNullable<BackendQueue['handler']> {
  const handler = queue.handler;
  if (!handler) throw new Error(`jobs: queue ${queue.name} has no handler`);
  return async (jobs) => {
    try {
      return await handler(jobs);
    } catch (error) {
      baseLog.error(`jobs: ${queue.name} handler failed`, { err: error, jobs: jobs.map((job) => job.id) });
      throw error;
    }
  };
}
