export const YJS_CLEANUP_DELAY_MS = 5 * 60 * 1000; // Delay before cleaning up a disconnected document (quick reconnects); also the retry interval when the final materialization can't reach the backend
export const YJS_SAVE_DEBOUNCE_MS = 3000; // Debounce rapid updates into a single save plus materialization, also the freshness cadence of the entity's description/summary for non-editing viewers
export const YJS_AWARENESS_RATE_LIMIT = 2; // Max 2 awareness updates per client per second to prevent spam and DoS
export const BACKEND_POLL_INTERVAL_MS = 2000; // Interval for Yjs workers to poll the backend for new updates when idle (no active clients)
export const BACKEND_POLL_TIMEOUT_MS = 60000; // Max time to wait for new updates in a poll before timing out and retrying (prevents hanging if backend is unresponsive)

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
