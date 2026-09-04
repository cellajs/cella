/** Cleanup grace period and retry interval for failed final durable writes. */
export const YJS_CLEANUP_DELAY_MS = 5 * 60 * 1000;
/** Backoff for a materialization the backend could not take (5xx or unreachable); a save window supersedes a pending retry, cleanup retries after the grace period. */
export const YJS_MATERIALIZE_RETRY_MS = [5_000, 30_000, 120_000] as const;
/** Debounces updates and controls description freshness for non-editing viewers. */
export const YJS_SAVE_DEBOUNCE_MS = 3000;
export const YJS_AWARENESS_RATE_LIMIT = 2; // Max 2 awareness updates per client per second to prevent spam and DoS

/** Identifies a document and its access context. Passed through the entire relay pipeline. */
export interface DocContext {
  entityType: string;
  entityId: string;
  tenantId: string;
  userId: string;
  organizationId: string | null;
  /** Whether entity access has been verified. Starts false; all reads and writes are buffered until async verify completes. */
  verified: boolean;
}
