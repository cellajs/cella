import process from 'node:process';
export const CDC_PUBLICATION_NAME = 'cdc_pub';

// biome-ignore lint/style/noProcessEnv: constants must stay import-safe; pulling in the env module here would run its validation on every import
export const CDC_SLOT_NAME = process.env.CDC_SLOT_NAME ?? 'cdc_slot';

export const RESOURCE_LIMITS = {
  // Runtime monitoring thresholds
  runtime: {
    /** How long the API may be away, with nothing consumed, before health reports unhealthy. */
    pauseUnhealthyMs: 5 * 60e3,
    /** How often the last confirmed position is sent again: well inside the server's `wal_sender_timeout` of a minute. */
    statusIntervalMs: 10_000,
  },

  // Reading again after a failed flush
  reread: {
    /** The wait before each read after a failure, by how many failed in a row; the last one repeats. */
    delaysMs: [500, 2000, 5000, 15_000, 30_000],
    /** Failures in a row at one position, caused by the change itself, after which the worker counts as stuck there. */
    stuckAfter: 5,
  },

  // Checking the books against the tables, and rebuilding them when they are lost
  books: {
    /** Statement timeout of a count from the tables, which reads every counted table once. */
    countTimeoutMs: 10 * 60e3,
    /** How long a verify waits for the stream to reach its snapshot before it gives up. */
    passTimeoutMs: 5 * 60e3,
    /** At most one rebuild for a stuck worker in this time: a fault that repeats costs one refetch per interval. */
    rebuildIntervalMs: 10 * 60e3,
    /** The hour (UTC) of the daily verify. */
    verifyHourUtc: 3,
    /** How often the worker looks for a verify or a rebuild that was asked for. */
    requestPollMs: 5000,
  },

  // Server-side limits for every session of the worker's pool
  database: { lockMs: 10_000, statementMs: 60_000, idleInTransactionMs: 30_000 },

  // Reconnection configuration
  reconnection: {
    /** Between replication subscription attempts. */
    retryDelayMs: 5000,
  },

  // Fast retries while a rolling deployment hands off the singleton slot.
  slotTakeover: {
    /** Number of fast retries that make up the handoff window. */
    maxAttempts: 12,
    /** Sized for a sub-second takeover. */
    retryDelayMs: 500,
  },

  // Buffer safety caps
  buffers: {
    /** Micro-batching fallback deadline for low-traffic periods; 0 disables batching. */
    flushWindowMs: 50,
    /** Primary flush trigger under load; the replication stream is held while this many events are pending. */
    flushBatchSize: 100,
    /** One flush, and so one database transaction, takes whole source transactions up to this many events; a larger source transaction goes alone. */
    flushMaxEvents: 2000,
  },

  // WAL lag thresholds for backpressure
  walLag: {
    warnBytes: 1 * 1024 * 1024 * 1024, // 1 GB
    unhealthyBytes: 2 * 1024 * 1024 * 1024, // 2 GB
  },
} as const;
