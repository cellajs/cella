/**
 * Publication name for CDC.
 */
export const CDC_PUBLICATION_NAME = 'cdc_pub';

/**
 * Replication slot name for CDC.
 */
export const CDC_SLOT_NAME = 'cdc_slot';

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

  // Slot takeover during rolling deployments
  slotTakeover: {
    /** Max attempts to take over an active slot before giving up */
    maxAttempts: 12,
    /** Delay between takeover attempts (ms) */
    retryDelayMs: 5000,
  },
} as const;

/**
 * Transient error codes that should trigger retry.
 * These are PostgreSQL error codes that indicate temporary failures.
 */
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
