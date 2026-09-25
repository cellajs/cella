/** Grace period after the last client leaves before the session row is compacted and deleted; also the retry interval when the backend cannot take the final write. */
export const YJS_CLEANUP_DELAY_MS = 5 * 60 * 1000;
/** Debounces compaction (merge the log into the base state and materialize) after the last received update; bounds description freshness for non-editing viewers. */
export const YJS_COMPACT_DEBOUNCE_MS = 3000;
/** Sync messages a socket may queue while its entity access is still being verified. */
export const YJS_PENDING_QUEUE_CAP = 100;
export const YJS_AWARENESS_RATE_LIMIT = 2; // Max 2 awareness updates per client per second to prevent spam and DoS

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
}
