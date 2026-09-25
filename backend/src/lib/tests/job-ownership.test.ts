import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAdminDb } from '#/db/db';
import { type LockSession, startJobOwnership } from '#/lib/job-ownership';
import type { BackendJob } from '#/lib/module';

/** Jobs that record which instances run them right now, and the most that ever ran at once. */
function jobTracker() {
  const running = new Set<string>();
  let maxConcurrent = 0;
  const jobsFor = (instance: string): BackendJob[] => [
    {
      name: 'sweep',
      start: () => {
        running.add(instance);
        maxConcurrent = Math.max(maxConcurrent, running.size);
        return () => running.delete(instance);
      },
    },
  ];
  return { running, jobsFor, maxConcurrent: () => maxConcurrent };
}

const stops: (() => void)[] = [];
const start = (...args: Parameters<typeof startJobOwnership>) => {
  const stop = startJobOwnership(...args);
  stops.push(stop);
  return stop;
};

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

/** Backend pids holding the job owner's advisory lock in this database. */
async function lockHolders(): Promise<number[]> {
  const result = await getAdminDb('job ownership test').execute<{ pid: number }>(sql`
    select pid from pg_locks
    where locktype = 'advisory' and granted and objsubid = 1
      and database = (select oid from pg_database where datname = current_database())
      and objid::text::bigint = (hashtext('backend-jobs')::bigint & 4294967295)`);
  return result.rows.map((row) => row.pid);
}

describe('job ownership on the database', () => {
  it('must not run a job on two instances at once, even while two generations overlap', async () => {
    const jobs = jobTracker();

    start({ jobs: jobs.jobsFor('old'), intervalMs: 20 });
    await vi.waitFor(() => expect([...jobs.running]).toEqual(['old']));

    // The new generation boots beside the old one and contends for many intervals.
    const stopNew = start({ jobs: jobs.jobsFor('new'), intervalMs: 20 });
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect([...jobs.running]).toEqual(['old']);
    expect(await lockHolders()).toHaveLength(1);

    // The old generation shuts down: its session ends, and the new one takes the jobs over.
    stops[0]?.();
    await vi.waitFor(() => expect([...jobs.running]).toEqual(['new']));
    expect(jobs.maxConcurrent()).toBe(1);

    stopNew();
    expect(jobs.running.size).toBe(0);
    await vi.waitFor(async () => expect(await lockHolders()).toEqual([]));
  });

  it('hands the jobs to a standby when the owner loses its database session', async () => {
    const jobs = jobTracker();
    start({ jobs: jobs.jobsFor('owner'), intervalMs: 20 });
    await vi.waitFor(() => expect([...jobs.running]).toEqual(['owner']));
    start({ jobs: jobs.jobsFor('standby'), intervalMs: 20 });

    // A crash, a network cut or an operator ending the session: Postgres drops the lock with it.
    const [ownerPid] = await lockHolders();
    expect(ownerPid).toBeDefined();
    await getAdminDb('job ownership test').execute(sql`select pg_terminate_backend(${ownerPid}::int)`);

    await vi.waitFor(() => expect([...jobs.running]).toEqual(['standby']));
    expect(await lockHolders()).toHaveLength(1);
  });
});

/** An in-memory stand-in for one Postgres advisory lock and the sessions contending for it. */
function fakeLockServer() {
  let holder: FakeSession | undefined;

  class FakeSession implements LockSession {
    closed = false;
    hangs = false;
    private errorListeners: ((error: Error) => void)[] = [];

    async query(text: string) {
      if (this.closed) throw new Error('session closed');
      if (this.hangs) return new Promise<never>(() => {});
      if (!text.includes('pg_try_advisory_lock')) return { rows: [] };
      if (!holder) holder = this;
      return { rows: [{ acquired: holder === this }] };
    }

    close() {
      this.closed = true;
      if (holder === this) holder = undefined;
    }

    onError(listener: (error: Error) => void) {
      this.errorListeners.push(listener);
    }
  }

  const sessions: FakeSession[] = [];
  return {
    sessions,
    openSession: async () => {
      const session = new FakeSession();
      sessions.push(session);
      return session;
    },
  };
}

describe('job ownership failure handling', () => {
  it('gives the jobs up when its lock session stops answering', async () => {
    const jobs = jobTracker();
    const server = fakeLockServer();
    start({ jobs: jobs.jobsFor('owner'), intervalMs: 10, livenessTimeoutMs: 20, openSession: server.openSession });
    await vi.waitFor(() => expect([...jobs.running]).toEqual(['owner']));

    const owned = server.sessions.find((session) => !session.closed);
    if (!owned) throw new Error('no owning session');
    owned.hangs = true;

    // An owner that cannot prove its session is alive must not keep running jobs.
    await vi.waitFor(() => expect(owned.closed).toBe(true));
    // Positive control: with a healthy session again it wins the lock back.
    await vi.waitFor(() => expect([...jobs.running]).toEqual(['owner']));
  });

  it('keeps contending while the database is unreachable, then takes the jobs', async () => {
    const jobs = jobTracker();
    const server = fakeLockServer();
    let reachable = false;
    const openSession = async () => {
      if (!reachable) throw new Error('connect ECONNREFUSED');
      return server.openSession();
    };
    start({ jobs: jobs.jobsFor('owner'), intervalMs: 10, openSession });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(jobs.running.size).toBe(0);
    reachable = true;
    await vi.waitFor(() => expect([...jobs.running]).toEqual(['owner']));
  });
});
