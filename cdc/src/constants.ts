import process from 'node:process';
export const CDC_PUBLICATION_NAME = 'cdc_pub';

// biome-ignore lint/style/noProcessEnv: constants must stay import-safe; pulling in the env module here would run its validation on every import
export const CDC_SLOT_NAME = process.env.CDC_SLOT_NAME ?? 'cdc_slot';

export const RESOURCE_LIMITS = {
  // The replication connection
  runtime: {
    /** How often the last acknowledged position is sent again: well inside Postgres's `wal_sender_timeout` of a minute. */
    statusIntervalMs: 10_000,
  },

  // Reading again after a failed flush
  reread: {
    /** The wait before each read after a failure, by how many failed in a row; the last one repeats. */
    delaysMs: [500, 2000, 5000, 15_000, 30_000],
    /** Failures in a row at one position, caused by the change itself, after which the worker counts as stuck there. */
    stuckAfter: 5,
  },

  // Checking the books against the tables, and rebuilding them when they are wrong or lost
  books: {
    /** Statement timeout of a rebuild's recount, which reads every counted table once while the flushes wait. */
    countTimeoutMs: 10 * 60e3,
    /** The one limit of a verify: on every statement of its recount, and on its wait for the stream to pass its snapshot. */
    verifyTimeoutMs: 5 * 60e3,
    /** At most one rebuild for a stuck worker in this time: a fault that repeats costs one refetch per interval. */
    rebuildIntervalMs: 10 * 60e3,
    /** The hour (UTC) at which the worker asks itself for the daily verify. */
    verifyHourUtc: 3,
    /** How often the worker looks for a verify or a rebuild that was asked for. */
    requestPollMs: 5000,
  },

  // Limits Postgres applies to every session of the worker's pool
  database: { lockMs: 10_000, statementMs: 60_000, idleInTransactionMs: 30_000 },

  // Subscribing again after a subscribe error
  reconnection: {
    /** Between two subscription attempts. */
    retryDelayMs: 5000,
  },

  // The first attempts after a subscribe error come sooner: a rolling deployment hands the slot over within a second.
  slotTakeover: {
    /** How many attempts come at the short delay. */
    maxAttempts: 12,
    retryDelayMs: 500,
  },

  // What the worker holds in memory
  buffers: {
    /** A flush starts this long after the first change is pending, when fewer than `flushBatchSize` arrive meanwhile. */
    flushWindowMs: 50,
    /** A flush starts at once when this many changes are pending, and the stream is held until they are flushed. */
    flushBatchSize: 100,
    /**
     * The largest source transaction the worker holds: it buffers a transaction whole until its commit, at about 2 KB
     * a change (measured: 225 MB for 100,000 attachment rows). A larger one fails where it passes this, like any change
     * the worker cannot process, and ends in a rebuild.
     */
    maxTransactionEvents: 100_000,
  },

  // What health grades the worker by
  health: {
    /** How long the API may be away before the worker reports unhealthy: by then it is an outage of sync, not a restart. */
    apiAwayUnhealthyMs: 5 * 60e3,
    /** Slot lag from which the worker reports degraded: it is behind, and the WAL still holds everything. */
    walLagDegradedBytes: 50 * 1024 * 1024,
    /** Slot lag that is logged as a warning. */
    walLagWarnBytes: 1 * 1024 * 1024 * 1024,
    /** Slot lag from which the worker reports unhealthy, and logs an error. */
    walLagUnhealthyBytes: 2 * 1024 * 1024 * 1024,
    /** Event-loop lag from which the worker reports degraded, the threshold the yjs relay uses too. */
    eventLoopLagDegradedMs: 100,
    /** Event-loop lag from which the worker reports unhealthy. */
    eventLoopLagUnhealthyMs: 1000,
  },
} as const;
