/** Grace period after the last client leaves before the session row is compacted and deleted; also the retry interval when the backend cannot take the final write. */
export const YJS_CLEANUP_DELAY_MS = 5 * 60 * 1000;
/** How often a session stamps its row live: well inside YJS_CLEANUP_DELAY_MS, the startup sweep's cutoff, so no relay's sweep takes a live session for an orphan. */
export const YJS_LIVE_TOUCH_MS = YJS_CLEANUP_DELAY_MS / 5;
/** Cleanup attempts before a session whose final write keeps failing is forgotten (an hour at the retry interval); its rows stay for the next session or the startup sweep. */
export const YJS_CLEANUP_MAX_ATTEMPTS = 12;
/** Debounces compaction (merge the log into the base state and materialize) after the last received update, up to YJS_COMPACT_MAX_WAIT_MS. */
export const YJS_COMPACT_DEBOUNCE_MS = 3000;
/** Longest wait for compaction after the first update since the last compaction started, however often later updates restart the debounce: bounds how far non-editing viewers fall behind, and the log, while someone types without pause. */
export const YJS_COMPACT_MAX_WAIT_MS = 10_000;
/** Sync messages a socket may queue while its entity access is still being verified. */
export const YJS_PENDING_QUEUE_CAP = 100;
export const YJS_AWARENESS_RATE_LIMIT = 2; // Max 2 awareness updates per client per second to prevent spam and DoS
/** Entries one awareness frame may carry: y-websocket announces its own client alone, and its larger frames re-send changes to other clients. */
export const YJS_AWARENESS_MAX_ENTRIES = 8;
/** Awareness clients one socket may hold: its own, plus a few that another socket of its user held or whose socket left. */
export const YJS_AWARENESS_MAX_CLIENTS = 4;

/**
 * A document and its place as the entity row states them: the session key, the tenant its rows are stored and read
 * under, and the scope materialize writes in. Only a scope read from the row reaches storage or a session.
 */
export interface DocScope {
  entityType: string;
  entityId: string;
  tenantId: string;
  organizationId: string | null;
}

/** The fields that identify a document: its session key and the tenant of its rows. */
export type DocKey = Pick<DocScope, 'entityType' | 'entityId' | 'tenantId'>;

/**
 * One socket: the user its token names and the document the token asks for. `scope` stays null until the user's
 * access is authorized against the entity row, and then holds the row's scope; until then the socket's sync frames
 * wait in its queue and it relays nothing.
 */
export interface SocketContext {
  userId: string;
  requested: DocScope;
  scope: DocScope | null;
  /** True from the relay's Step1 until the socket's Step2 answers it: an update sent meanwhile is dropped, since the reply carries it and its document may be one the client is about to drop. */
  awaitingReply: boolean;
}
