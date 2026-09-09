/** Grace period after the last client leaves before the session row is compacted and deleted; also the retry interval when the backend cannot take the final write. */
export const YJS_CLEANUP_DELAY_MS = 5 * 60 * 1000;
/** Debounces compaction (merge the log into the base state and materialize) after the last received update; bounds description freshness for non-editing viewers. */
export const YJS_COMPACT_DEBOUNCE_MS = 3000;
/** Sync messages a socket may queue while its entity access is still being verified. */
export const YJS_PENDING_QUEUE_CAP = 100;
export const YJS_AWARENESS_RATE_LIMIT = 2; // Max 2 awareness updates per client per second to prevent spam and DoS

/** Identifies a document and its access context. Passed through the entire relay pipeline. */
export interface DocContext {
  entityType: string;
  entityId: string;
  tenantId: string;
  userId: string;
  organizationId: string | null;
  /** Whether entity access has been verified. Starts false; a socket's sync messages wait in its queue until async verify completes. */
  verified: boolean;
}
