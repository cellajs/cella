import type { YjsDocKey } from '#/modules/yjs/helpers/yjs-log';

/**
 * Grace period after the last client leaves before the session's log is compacted and the session forgotten; also the
 * retry interval when the backend cannot take the final write.
 */
export const yjsCleanupDelayMs = 5 * 60 * 1000;
/**
 * How often a session stamps its row live: well inside yjsCleanupDelayMs, the sweep's cutoff, so no relay's sweep takes
 * a live session for an orphan.
 */
export const yjsLiveStampMs = yjsCleanupDelayMs / 5;
/**
 * Cleanup attempts before a session whose final write keeps failing is forgotten (an hour at the retry interval); its
 * rows stay for the next session or the sweep.
 */
export const yjsCleanupMaxAttempts = 12;
/** Debounces compaction (merge the log into the base state and materialize) after the last received update, up to yjsCompactMaxWaitMs. */
export const yjsCompactDebounceMs = 3000;
/**
 * Longest wait for compaction after the first update since the last compaction started, however often later updates
 * restart the debounce: bounds how far non-editing viewers fall behind, and the log, while someone types without pause.
 */
export const yjsCompactMaxWaitMs = 10_000;
/**
 * How long a relay collects its committed appends before it announces them, one notice per document in one statement.
 * A notifying commit holds a cluster-wide lock through its WAL flush, so one per keystroke serialized every append and
 * the relay fell behind its typists under load; at most twenty a second per relay leave the lock idle. Other relays'
 * sockets wait this much longer for the rows.
 */
export const yjsLogNoticeDelayMs = 50;
/** Sync messages a socket may queue while its entity access is still being verified. */
export const yjsPendingQueueCap = 100;
/** Awareness frames a socket relays per second. What it sends in between is held, the latest state per client, and relayed when the window ends. */
export const yjsAwarenessRateLimit = 2;
/** Entries one awareness frame may carry: y-websocket announces its own client alone, and its larger frames re-send changes to other clients. */
export const yjsAwarenessMaxEntries = 8;
/** Awareness clients one socket may hold: its own, plus a few that another socket of its user held or whose socket left. */
export const yjsAwarenessMaxClients = 4;
/** Bytes a socket may hold unsent before the relay closes it (1013): one that never reads would buffer every frame. */
export const yjsMaxBufferedBytes = 8 * 1024 * 1024;

/** A document's key in the relay's maps and log lines: tenant, type and id, so no two tenants share a session. */
export function docKey({ tenantId, entityType, entityId }: YjsDocKey): string {
  return `${tenantId}:${entityType}:${entityId}`;
}

/**
 * Message types on the socket: y-websocket's sync and awareness, and the relay's own `Generation` and `Saved`. The
 * frontend's `yjsMessageTypes` (yjs-connections.ts) must match.
 */
export const yjsMessageTypes = {
  Sync: 0,
  Awareness: 1,
  Generation: 4,
  /**
   * Empty body, to the sender alone, after each of its Step2 or Update frames the relay logged, found empty or dropped
   * as covered by a pending reply.
   */
  Saved: 5,
} as const;
