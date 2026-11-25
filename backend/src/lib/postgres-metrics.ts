import { context, ValueType } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import type { Pool, PoolClient } from 'pg';
import { isPool } from '#/db/create-connection';
import { baseDb } from '#/db/db';
import { baseLog } from '#/lib/pino';
import { otel } from '#/lib/tracing';

/** A skipped or cut read logs at most this often; development collects every 5 s. */
const failureLogIntervalMs = 60_000;

/** The states `postgresql.backends` splits on. */
const backendStates = ['active', 'idle', 'idle in transaction', 'other'] as const;

interface SlotRow {
  slot_name: string;
  active: boolean;
  wal_status: string;
  /** Bytes; null when the slot reserves no WAL. */
  retained: number | null;
}

interface StatisticsRow {
  name: string;
  version: string;
  max_connections: number;
  /** Bytes; -1 when slots may retain WAL without limit. */
  keep_limit: number;
  size: number;
  xid_age: number;
  commits: number;
  rollbacks: number;
  deadlocks: number;
  temp_files: number;
  active: number;
  idle: number;
  'idle in transaction': number;
  other: number;
  lock_waiting: number;
  /** Seconds. */
  oldest_age: number;
  slots: SlotRow[];
}

/**
 * One statement, so the statement timeout bounds the whole read. A client backend of another role reads with a null
 * `backend_type` and state without `pg_read_all_stats`: a row with a database and a role is counted as one, in `other`.
 */
const statisticsQuery = `
  SELECT d.datname AS name,
    split_part(current_setting('server_version'), ' ', 1) AS version,
    current_setting('max_connections')::int AS max_connections,
    pg_size_bytes(current_setting('max_slot_wal_keep_size'))::float8 AS keep_limit,
    pg_database_size(d.oid)::float8 AS size,
    age(d.datfrozenxid) AS xid_age,
    s.xact_commit::float8 AS commits, s.xact_rollback::float8 AS rollbacks,
    s.deadlocks::float8 AS deadlocks, s.temp_files::float8 AS temp_files,
    a.*,
    (SELECT COALESCE(json_agg(json_build_object('slot_name', slot_name, 'active', active, 'wal_status', wal_status,
        'retained', pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)::float8)), '[]'::json)
      FROM pg_replication_slots WHERE database = current_database()) AS slots
  FROM pg_database d
  JOIN pg_stat_database s ON s.datid = d.oid
  CROSS JOIN (
    SELECT count(*) FILTER (WHERE state = 'active')::int AS active,
      count(*) FILTER (WHERE state = 'idle')::int AS idle,
      count(*) FILTER (WHERE state = 'idle in transaction')::int AS "idle in transaction",
      count(*) FILTER (WHERE state IS NULL OR state NOT IN ('active', 'idle', 'idle in transaction'))::int AS other,
      count(*) FILTER (WHERE wait_event_type = 'Lock')::int AS lock_waiting,
      COALESCE(EXTRACT(EPOCH FROM max(now() - xact_start)), 0)::float8 AS oldest_age
    FROM pg_stat_activity
    WHERE backend_type = 'client backend' OR (backend_type IS NULL AND datid IS NOT NULL AND usesysid IS NOT NULL)
  ) a
  WHERE d.datname = current_database()`;

/** Why a collection reports no statistics. */
class SkippedRead extends Error {}

/** Whether a connection asked for after its time is still awaited: no second request queues behind it. */
let lateConnectPending = false;

/**
 * A connection of the pool within `ms`. One that arrives later goes back at once.
 * @throws SkippedRead when none comes in time, or while an earlier late one is still awaited.
 */
async function connectWithin(pool: Pool, ms: number): Promise<PoolClient> {
  if (lateConnectPending) throw new SkippedRead('an earlier read still waits for a connection of the runtime pool');
  const connecting = pool.connect();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeUp = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  const client = await Promise.race([connecting, timeUp]).finally(() => clearTimeout(timer));
  if (client) return client;
  lateConnectPending = true;
  connecting
    .then((lateClient) => lateClient.release())
    .catch(() => {})
    .finally(() => {
      lateConnectPending = false;
    });
  throw new SkippedRead(`no connection of the runtime pool came within ${ms}ms`);
}

/** Reads the statistics on a connection of its own, the connection wait and the statement each bounded. */
async function readStatistics(pool: Pool, connectMs: number, statementMs: number): Promise<StatisticsRow> {
  const client = await connectWithin(pool, connectMs);
  let failed = false;
  try {
    await client.query(`BEGIN READ ONLY; SET LOCAL statement_timeout = ${statementMs}`);
    const { rows } = await client.query<StatisticsRow>(statisticsQuery);
    await client.query('COMMIT');
    return rows[0];
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    // A failed connection is destroyed, so its aborted transaction never returns to the pool.
    client.release(failed);
  }
}

/**
 * Reports the database's statistics at every metric collection: the server's client sessions by state against its
 * connection limit, the oldest transaction and the sessions waiting for a lock among them, and this database's size,
 * transaction and deadlock counters, transaction id age and the WAL its replication slots hold.
 *
 * Each collection reads on the runtime pool, untraced, within the time the SDK gives a callback: a read that gets no
 * connection in time or runs out of time reports nothing and logs once a minute at most.
 *
 * A role without `pg_read_all_stats` sees another role's client sessions without their state, wait or transaction:
 * they count as `other`, together with the few database-bound background workers it cannot tell apart from them (the
 * pg_cron launcher), and the oldest transaction and the lock waits cover the role's own sessions alone.
 */
export function registerPostgresMetrics(): void {
  const pool: unknown = baseDb.$client;
  if (!isPool(pool)) return;
  // The connection wait and the statement fit in the callback's time, with room for the round trips around them.
  const connectMs = Math.min(2000, Math.floor(otel.callbackTimeoutMs * 0.3));
  const statementMs = Math.min(2000, Math.floor(otel.callbackTimeoutMs * 0.4));

  const meter = otel.meterProvider.getMeter('postgres');
  const gauge = (name: string, unit: string, description: string, valueType = ValueType.INT) =>
    meter.createObservableGauge(name, { unit, description, valueType });
  const counter = (name: string, unit: string, description: string) =>
    meter.createObservableCounter(name, { unit, description, valueType: ValueType.INT });

  const backends = gauge('postgresql.backends', '{backend}', 'Client sessions of the server by state.');
  const connectionMax = gauge('postgresql.connection.max', '{connection}', 'Sessions the server accepts.');
  const size = gauge('postgresql.db_size', 'By', 'Disk space of this database.');
  // A skipped read exports these four counters' last values again: their rate reads 0 for that minute.
  const commits = counter('postgresql.commits', '{transaction}', 'Transactions committed in this database.');
  const rollbacks = counter('postgresql.rollbacks', '{transaction}', 'Transactions rolled back in this database.');
  const deadlocks = counter('postgresql.deadlocks', '{deadlock}', 'Deadlocks detected in this database.');
  const tempFiles = counter('postgresql.temp_files', '{file}', 'Temporary files queries in this database wrote.');
  const slotRetained = gauge('postgresql.replication_slot.retained', 'By', 'WAL a replication slot holds back.');
  const slotActive = gauge('postgresql.replication_slot.active', '1', 'Whether a reader is attached to a replication slot.');
  const keepLimit = gauge('postgresql.replication_slot.keep_limit', 'By', 'WAL a slot may hold back before the server drops it.');
  const oldestAge = gauge('postgresql.transaction.oldest_age', 's', 'Age of the oldest open transaction.', ValueType.DOUBLE);
  const lockWaiting = gauge('postgresql.lock.waiting', '{session}', 'Sessions waiting for a lock.');
  const xidAge = gauge('postgresql.xid.age', '{transaction}', 'Transactions since the database was last frozen.');

  let lastFailureLogAt = 0;

  meter.addBatchObservableCallback(
    async (result) => {
      let database: StatisticsRow;
      try {
        // Untraced: a read every collection would otherwise export traces of its own.
        database = await context.with(suppressTracing(context.active()), () => readStatistics(pool, connectMs, statementMs));
      } catch (error) {
        if (Date.now() - lastFailureLogAt >= failureLogIntervalMs) {
          lastFailureLogAt = Date.now();
          const reason = error instanceof SkippedRead ? error.message : 'the read failed or ran out of time';
          baseLog.warn(`postgres metrics: no statistics this collection: ${reason}`, error instanceof SkippedRead ? undefined : { err: error });
        }
        return;
      }

      const on = { 'postgresql.database.name': database.name };
      for (const state of backendStates) result.observe(backends, database[state], { ...on, state });
      result.observe(connectionMax, database.max_connections, { ...on, 'db.system.version': database.version });
      result.observe(size, database.size, on);
      result.observe(commits, database.commits, on);
      result.observe(rollbacks, database.rollbacks, on);
      result.observe(deadlocks, database.deadlocks, on);
      result.observe(tempFiles, database.temp_files, on);
      result.observe(oldestAge, database.oldest_age, on);
      result.observe(lockWaiting, database.lock_waiting, on);
      result.observe(xidAge, database.xid_age, on);
      if (database.keep_limit >= 0) result.observe(keepLimit, database.keep_limit, on);
      for (const slot of database.slots) {
        const ofSlot = { ...on, slot_name: slot.slot_name };
        if (slot.retained !== null) result.observe(slotRetained, slot.retained, ofSlot);
        result.observe(slotActive, slot.active ? 1 : 0, { ...ofSlot, wal_status: slot.wal_status });
      }
    },
    [backends, connectionMax, size, commits, rollbacks, deadlocks, tempFiles, slotRetained, slotActive, keepLimit, oldestAge, lockWaiting, xidAge],
  );
}
