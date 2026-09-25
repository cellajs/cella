import type pg from 'pg';
import { baseDb } from '#/db/db';
import type { BackendJob } from '#/lib/module';
import { baseLog } from '#/lib/pino';

/** Names the session-level advisory lock the job owner holds (`hashtext` of it); advisory locks are per database. */
const lockName = 'backend-jobs';

/** A standby tries the lock, and the owner checks its session, this often. */
const defaultIntervalMs = 30_000;

/** The owner gives the jobs up when its session does not answer a check within this. */
const defaultLivenessTimeoutMs = 10_000;

/**
 * Postgres ends the owner's session after this long without a check, which frees the lock when the owner vanished
 * without closing its connection (a lost VM, a cut network). Three missed checks at the default interval.
 */
const idleSessionTimeout = '90s';

/** One Postgres session. A session-level advisory lock lives exactly as long as it. */
export interface LockSession {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  /** Ends the session; Postgres drops every advisory lock it held. */
  close(): void;
  /** Registers a listener for a connection failure outside a query. */
  onError(listener: (error: Error) => void): void;
}

const isPool = (client: unknown): client is pg.Pool =>
  typeof client === 'object' && client !== null && 'connect' in client && 'idleCount' in client;

/** A dedicated connection from the runtime pool, destroyed on close so no lock-holding session returns to the pool. */
async function openPoolSession(): Promise<LockSession> {
  const pool = baseDb.$client;
  if (!isPool(pool)) throw new Error('job ownership needs the runtime pg pool');
  const client = await pool.connect();
  return {
    query: (text, values) => client.query(text, values),
    close: () => client.release(true),
    onError: (listener) => client.on('error', listener),
  };
}

/** Resolves false once `ms` passes first. */
async function withinTimeout(check: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([check.then(() => true), timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

interface JobOwnershipOptions {
  jobs: readonly BackendJob[];
  intervalMs?: number;
  livenessTimeoutMs?: number;
  /** Opens the session that contends for the lock; defaults to a dedicated connection from the runtime pool. */
  openSession?: () => Promise<LockSession>;
}

/**
 * Runs the scheduled jobs on exactly one instance at a time. Every contending instance tries a session-level Postgres
 * advisory lock on its own connection; the holder starts the jobs, the others retry each interval. The lock lives as
 * long as the holder's session, so it moves to a standby when the holder shuts down, crashes or loses its connection:
 * during a rollout the old generation keeps the jobs while it runs and the new one takes them over when it stops. The
 * holder checks its session each interval and stops the jobs as soon as that check fails, before Postgres could hand
 * the lock to anyone else.
 * @returns Stops the jobs and releases the lock; safe to call twice.
 */
export function startJobOwnership({
  jobs,
  intervalMs = defaultIntervalMs,
  livenessTimeoutMs = defaultLivenessTimeoutMs,
  openSession = openPoolSession,
}: JobOwnershipOptions): () => void {
  let owned: LockSession | undefined;
  let stopJobs: (() => void)[] = [];
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const release = (session: LockSession, reason: string) => {
    if (owned !== session) return;
    owned = undefined;
    for (const stop of stopJobs) stop();
    stopJobs = [];
    try {
      session.close();
    } catch (error) {
      baseLog.warn('Closing the job lock session failed', { err: error });
    }
    baseLog.info('Released the scheduled jobs', { reason });
  };

  const tryAcquire = async () => {
    const session = await openSession();
    let acquired = false;
    try {
      await session.query(`SET idle_session_timeout = '${idleSessionTimeout}'`);
      const { rows } = await session.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired', [lockName]);
      acquired = rows[0]?.acquired === true && !stopped;
    } finally {
      if (!acquired) session.close();
    }
    if (!acquired) return;
    owned = session;
    session.onError((error) => release(session, `lock session failed: ${error.message}`));
    stopJobs = jobs.map((job) => job.start());
    baseLog.info('Owns the scheduled jobs', { jobs: jobs.map((job) => job.name) });
  };

  const tick = async () => {
    try {
      const session = owned;
      if (!session) await tryAcquire();
      else if (!(await withinTimeout(session.query('SELECT 1'), livenessTimeoutMs))) {
        release(session, 'lock session stopped answering');
      }
    } catch (error) {
      baseLog.warn('Contending for the scheduled jobs failed', { err: error });
    } finally {
      if (!stopped) {
        timer = setTimeout(tick, intervalMs);
        timer.unref();
      }
    }
  };

  void tick();

  return () => {
    stopped = true;
    clearTimeout(timer);
    if (owned) release(owned, 'shutdown');
  };
}
