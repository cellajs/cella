import { PgBoss } from 'pg-boss';
import { testRuntimeDatabaseUrl } from 'shared/test-db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureQueues, scheduleJobs } from '#/lib/jobs';
import { mapJobsComponent, readJobsHealth } from '#/lib/jobs-health';
import { getBackendJobs } from '#/lib/module';
import { JOBS_SCHEMA, jobsOptions } from '#/lib/pg-boss';
import { installJobsSchema } from '../../scripts/db/install-jobs-schema';

const TEST_QUEUE = 'jobs-store-test';

async function waitFor(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * The store as production runs it: installed and granted by the owner (the migrate companion,
 * here the test superuser), then enqueued, worked, scheduled and supervised by `runtime_role`
 * through the grants alone. Uses the test schema, never the development store.
 */
describe('job store as runtime_role', () => {
  let boss: PgBoss;

  beforeAll(async () => {
    await installJobsSchema();
    boss = new PgBoss(jobsOptions('maintainer', { connectionString: testRuntimeDatabaseUrl }));
    boss.on('error', () => {});
    await boss.start();
    // A queue left behind by an aborted run keeps its policy (createQueue never alters one), so start clean.
    if (await boss.getQueue(TEST_QUEUE)) await boss.deleteQueue(TEST_QUEUE);
  });

  afterAll(async () => {
    await boss.deleteAllJobs();
    await boss.stop({ graceful: true, timeout: 3_000 });
  });

  it('installs into the test schema with every declared job queue', async () => {
    expect(JOBS_SCHEMA).toBe('pgboss_test');
    const queues = await boss.getQueues();
    for (const job of getBackendJobs()) {
      expect(queues.find((queue) => queue.name === job.name)?.policy).toBe('singleton');
    }
  });

  it('converges queues and schedules every cron job', async () => {
    await ensureQueues(boss);
    await scheduleJobs(boss);
    const scheduled = (await boss.getSchedules()).map((schedule) => schedule.name).sort();
    expect(scheduled).toEqual(
      getBackendJobs()
        .map((job) => job.name)
        .sort(),
    );
  });

  it('enqueues, works and completes a job', async () => {
    // `stately` keeps one job per state and key, so an identical send while one waits collapses into it.
    await boss.createQueue(TEST_QUEUE, { policy: 'stately', retryLimit: 0 });
    const id = await boss.send(TEST_QUEUE, { hello: 'world' }, { singletonKey: 'once' });
    expect(id).not.toBeNull();
    // A second send under the same key collapses into the job still waiting.
    expect(await boss.send(TEST_QUEUE, { hello: 'again' }, { singletonKey: 'once' })).toBeNull();
    const seen: unknown[] = [];
    const workerId = await boss.work<{ hello: string }>(TEST_QUEUE, { pollingIntervalSeconds: 0.5 }, async (jobs) => {
      seen.push(...jobs.map((job) => job.data));
    });
    await waitFor(() => seen.length === 1);
    expect(seen).toEqual([{ hello: 'world' }]);
    await boss.offWork(TEST_QUEUE, { id: workerId, wait: true });
    const [job] = await boss.findJobs(TEST_QUEUE, { id: id as string });
    expect(job?.state).toBe('completed');
    await boss.deleteQueue(TEST_QUEUE);
  });

  it('supervises the store as the runtime role', async () => {
    await expect(boss.supervise()).resolves.toBeUndefined();
  });

  it('reports the store in health', async () => {
    const snapshot = await readJobsHealth();
    expect(snapshot.installed).toBe(true);
    expect(snapshot.schema).toBe(JOBS_SCHEMA);
    expect(snapshot.queues.map((queue) => queue.name)).toEqual(
      expect.arrayContaining(getBackendJobs().map((job) => job.name)),
    );
    const component = mapJobsComponent(snapshot, true);
    expect(['healthy', 'degraded']).toContain(component.status);
    expect(component.details).toHaveProperty('queues');
  });
});
