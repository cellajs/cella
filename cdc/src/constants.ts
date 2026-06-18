/**
 * Publication name for CDC.
 */
export const CDC_PUBLICATION_NAME = "cdc_pub";

/**
 * Replication slot name for CDC.
 */
export const CDC_SLOT_NAME = process.env.CDC_SLOT_NAME ?? "cdc_slot";

/**
 * CDC Resource Limits and Thresholds
 */
export const RESOURCE_LIMITS = {
  // Runtime monitoring thresholds
  runtime: {
    /** Pause duration before unhealthy status (5 minutes) */
    pauseUnhealthyMs: 5 * 60e3,
  },

  // Retry configuration for transient errors
  retry: {
    /** Maximum number of retry attempts */
    maxAttempts: 3,
    /** Initial delay before first retry (ms) */
    initialDelayMs: 100,
    /** Maximum delay between retries (ms) */
    maxDelayMs: 5000,
    /** Backoff multiplier */
    backoffMultiplier: 2,
  },

  // Reconnection configuration
  reconnection: {
    /** Delay before retrying replication subscription (ms) */
    retryDelayMs: 5000,
  },

  // Slot takeover during rolling deployments. The new generation's worker boots
  // warm and contends for the slot the old worker still holds; for this initial
  // handoff window it retries fast so the cutover is sub-second, then settles to
  // the normal `reconnection` cadence (see subscribeWithReconnect).
  slotTakeover: {
    /** Number of fast retries that make up the handoff window. */
    maxAttempts: 12,
    /** Delay between handoff retries (ms) — tightened for a sub-second takeover. */
    retryDelayMs: 500,
  },

  // Catchup mode thresholds
  catchup: {
    /** WAL lag threshold to enter catchup mode (ms) */
    enterLagMs: 10_000,
    /** WAL lag threshold to exit catchup mode (ms) */
    exitLagMs: 2_000,
    /** Consecutive live transactions before exiting catchup */
    exitConsecutiveLive: 3,
    /** Log progress every N events during catchup */
    progressLogInterval: 1000,
  },

  // Buffer safety caps
  buffers: {
    /** Micro-batching window (ms). Fallback deadline for low-traffic periods.
     *  0 = immediate (no batching), 50 = default */
    flushWindowMs: 50,
    /** Flush as soon as this many events accumulate (primary trigger under load) */
    flushBatchSize: 100,
    /** Force-flush if accumulated events exceed this count */
    maxBufferedEvents: 20_000,
    /** Flush events individually if no commit arrives within this window (ms) */
    transactionTimeoutMs: 30_000,
  },

  // WAL lag thresholds for backpressure
  walLag: {
    /** WAL lag in bytes before logging a warning */
    warnBytes: 1 * 1024 * 1024 * 1024, // 1 GB
    /** WAL lag in bytes that triggers unhealthy health status */
    unhealthyBytes: 2 * 1024 * 1024 * 1024, // 2 GB
  },
} as const;

/**
 * Transient error codes that should trigger retry.
 * These are PostgreSQL error codes that indicate temporary failures.
 */
export const TRANSIENT_ERROR_CODES = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "53000", // insufficient_resources
  "53100", // disk_full
  "53200", // out_of_memory
  "53300", // too_many_connections
  "57P03", // cannot_connect_now
  "08000", // connection_exception
  "08003", // connection_does_not_exist
  "08006", // connection_failure
]);
