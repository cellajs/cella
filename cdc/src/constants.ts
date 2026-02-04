import { appConfig } from 'config';
import type { ActivityAction } from '#/sync/activity-bus';

/**
 * Convert a CDC operation to an activity action.
 */
export const cdcOperationToAction: Record<string, ActivityAction> = {
  insert: 'create',
  update: 'update',
  delete: 'delete',
};

// Sanitize slug for use in PostgreSQL
const sanitizedSlug = appConfig.slug.replace(/-/g, '_');

/**
 * Publication name for CDC.
 */
export const CDC_PUBLICATION_NAME = `${sanitizedSlug}_cdc_pub`;

/**
 * Replication slot name for CDC.
 */
export const CDC_SLOT_NAME = `${sanitizedSlug}_cdc_slot`;

/**
 * CDC Resource Limits and Thresholds
 */
export const RESOURCE_LIMITS = {
  // PostgreSQL max_slot_wal_keep_size configuration (set at startup)
  wal: {
    /** Percentage of free disk to allow for WAL */
    percentageOfDisk: 0.2,
    /** Minimum max_slot_wal_keep_size (1 GB) */
    minSize: 1e9,
    /** Maximum max_slot_wal_keep_size (50 GB) */
    maxSize: 50e9,
  },
  
  // Minimum requirements to start CDC
  startup: {
    /** Minimum free disk required to start CDC (10 GB) */
    minFreeDisk: 10e9,
  },
  
  // Runtime monitoring thresholds
  runtime: {
    /** Pause duration before warning (60 seconds) */
    pauseWarningMs: 60e3,
    /** Pause duration before unhealthy status (5 minutes) */
    pauseUnhealthyMs: 5 * 60e3,
    /** Pause duration before emergency shutdown (10 minutes) */
    pauseMaxMs: 10 * 60e3,
    
    /** WAL warning threshold (500 MB) */
    walWarningBytes: 500e6,
    /** WAL emergency shutdown threshold (1 GB) */
    walShutdownBytes: 1e9,
    
    /** Free disk warning threshold (10 GB) */
    diskWarningBytes: 10e9,
    /** Free disk unhealthy threshold (5 GB) */
    diskUnhealthyBytes: 5e9,
    /** Free disk emergency shutdown threshold (5 GB) */
    diskShutdownBytes: 5e9,
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
