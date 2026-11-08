import process from 'node:process';
import { defaultCdcSlotName } from 'shared/utils/worker-env';

/** The publication the worker reads: the CDC migration builds it over the tracked tables. */
export const cdcPublicationName = 'cdc_pub';

/** The worker's replication slot; tests set `CDC_SLOT_NAME` to read a slot of their own. */
// biome-ignore lint/style/noProcessEnv: constants must stay import-safe; pulling in the env module here would run its validation on every import
export const cdcSlotName = process.env.CDC_SLOT_NAME ?? defaultCdcSlotName;

/** The limits and timings of reading, recording, the books and health. */
export const resourceLimits = {
  /** The replication connection. */
  runtime: {
    /** How often the last acknowledged position is sent again: well inside Postgres's `wal_sender_timeout` of a minute. */
    statusIntervalMs: 10_000,
  },

  /** Reading again after a failed flush or subscription. */
  reread: {
    /**
     * The wait before each read after a failure, by how many failed in a row; the last one repeats. The first one is
     * short: a rolling deployment hands the slot over within a second.
     */
    delaysMs: [500, 2000, 5000, 15_000, 30_000],
  },

  /** Checking the books against the tables, and rebuilding them when they are wrong or lost. */
  books: {
    /** Statement timeout of a rebuild's recount, which reads every counted table once while the flushes wait. */
    countTimeoutMs: 10 * 60e3,
    /** The one limit of a verify: on every statement of its recount, and on its wait for the stream to pass its snapshot. */
    verifyTimeoutMs: 5 * 60e3,
    /** How long a verify that gave no answer waits before it runs again: a recount that cannot finish never runs back to back. */
    verifyRetryMs: 10 * 60e3,
    /** The hour (UTC) at which the worker asks itself for the daily verify. */
    verifyHourUtc: 3,
    /** How often the worker looks for a verify or a rebuild that was asked for. */
    requestPollMs: 5000,
  },

  /** Limits Postgres applies to every session of the worker's pool. */
  database: { lockMs: 10_000, statementMs: 60_000, idleInTransactionMs: 30_000 },

  /** What the worker holds in memory. */
  buffers: {
    /** A flush starts this long after the first change is pending, when fewer than `flushBatchSize` arrive meanwhile. */
    flushWindowMs: 50,
    /** A flush starts at once when this many changes are pending, and the stream is held until they are flushed. */
    flushBatchSize: 100,
    /**
     * The largest source transaction the worker holds: it buffers a transaction whole until its commit, at about 2 KB
     * a change (measured: 225 MB for 100,000 attachment rows). A larger one fails where it passes this, like any change
     * the worker cannot process.
     */
    maxTransactionEvents: 100_000,
  },

  /** What health grades the worker by. */
  health: {
    /** How long the API may be away before the worker reports unhealthy: by then it is an outage of sync, not a restart. */
    apiAwayUnhealthyMs: 5 * 60e3,
    /** How long the worker may read again without getting past a failure, whatever failed, before it reports unhealthy. */
    rereadUnhealthyMs: 10 * 60e3,
    /** Slot lag from which the worker reports degraded: it is behind, and the WAL still holds everything. */
    walLagDegradedBytes: 50 * 1024 * 1024,
    /** Slot lag that is logged as a warning. */
    walLagWarnBytes: 1 * 1024 * 1024 * 1024,
    /**
     * The WAL bound: slot lag from which the worker reports unhealthy and logs an error, and drops its slot once it has
     * also not got past a failure for `rereadUnhealthyMs`. Far below the database volume (`infra/config/general.config.ts`);
     * where `max_slot_wal_keep_size` is set at or below it, Postgres invalidates the slot first, and the same rebuild follows.
     */
    walLagUnhealthyBytes: 2 * 1024 * 1024 * 1024,
  },
} as const;
