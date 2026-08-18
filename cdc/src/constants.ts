import process from 'node:process';
export const CDC_PUBLICATION_NAME = 'cdc_pub';

// biome-ignore lint/style/noProcessEnv: constants must stay import-safe; pulling in the env module here would run its validation on every import
export const CDC_SLOT_NAME = process.env.CDC_SLOT_NAME ?? 'cdc_slot';

export const RESOURCE_LIMITS = {
  // Runtime monitoring thresholds
  runtime: {
    /** How long replication may stay paused before health reports unhealthy. */
    pauseUnhealthyMs: 5 * 60e3,
  },

  // Retry configuration for transient errors
  retry: {
    maxAttempts: 3,
    initialDelayMs: 100,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
  },

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

  // Catchup mode thresholds
  catchup: {
    enterLagMs: 10_000,
    exitLagMs: 2_000,
    /** Consecutive live transactions required before catchup mode exits. */
    exitConsecutiveLive: 3,
    /** Log catchup progress every N events. */
    progressLogInterval: 1000,
  },

  // Buffer safety caps
  buffers: {
    /** Micro-batching fallback deadline for low-traffic periods; 0 disables batching. */
    flushWindowMs: 50,
    /** Primary flush trigger under load. */
    flushBatchSize: 100,
    /** Hard cap that force-flushes the buffer. */
    maxBufferedEvents: 20_000,
    /** Events flush individually when no commit arrives within this window. */
    transactionTimeoutMs: 30_000,
  },

  // WAL lag thresholds for backpressure
  walLag: {
    warnBytes: 1 * 1024 * 1024 * 1024, // 1 GB
    unhealthyBytes: 2 * 1024 * 1024 * 1024, // 2 GB
  },
} as const;

/** PostgreSQL error codes that indicate transient failures and should trigger retry. */
export const TRANSIENT_ERROR_CODES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '53000', // insufficient_resources
  '53100', // disk_full
  '53200', // out_of_memory
  '53300', // too_many_connections
  '57P03', // cannot_connect_now
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
]);
