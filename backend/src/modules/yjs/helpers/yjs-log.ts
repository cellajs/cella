// Database-free: the Yjs log's limits, keys, row shapes and notice codec, which the relay shares through `#/`.

/**
 * The channel appends and retirements notify on: a wake-up for relays, never content. The backend notifies in the
 * writing transaction; a relay announces its own appends once they committed, batched per document.
 */
export const YJS_LOG_CHANNEL = 'yjs_log';

/** Log ids one notice carries at most: at the longest keys and ids it stays below the 8,000-byte limit on a notification. */
export const YJS_LOG_NOTICE_MAX_IDS = 200;

/** The largest update the log takes: the cap the relay's socket puts on one frame. */
export const YJS_MAX_UPDATE_BYTES = 2 * 1024 * 1024;

/**
 * The largest update one HTTP push carries. Base64url-encoded, a third larger, it stays under the API's 1 MB JSON body
 * limit. The frontend posts in chunks of this size (HTTP_CHUNK_BYTES in yjs-http.ts).
 */
export const YJS_HTTP_CHUNK_BYTES = 512 * 1024;

/** A collaborative document: its entity, and the tenant its rows are stored and read under. */
export interface YjsDocKey {
  entityType: string;
  entityId: string;
  tenantId: string;
}

/** A document key plus the organization its rows carry. */
export interface YjsDocScope extends YjsDocKey {
  organizationId: string | null;
}

/** One logged update, in arrival order: a client's, under its sender, or a server-origin one with no user. */
export interface LogRow {
  id: number;
  payload: Uint8Array;
  userId: string | null;
}

/** A document in one consistent read: the base state of its generation, and every log row not folded into it. */
export interface YjsDocumentRead {
  generation: string;
  base: Uint8Array;
  rows: LogRow[];
}

/**
 * What a relay hears on YJS_LOG_CHANNEL: rows appended to a document's log, one or more and never none, or the document
 * retired. Keys only. A relay acts on a notice holding any row it has not relayed: rows of one batch can commit out of
 * id order, so a receiver may have read the newest while an older one was still uncommitted.
 */
export type LogNotice =
  | { tenantId: string; entityType: string; entityId: string; logIds: number[] }
  | { tenantId: string; entityType: string; entityId: string; retired: true };

/**
 * The payload of a notice: short keys, so it stays far below the 8,000-byte limit on a notification. One row travels
 * as `id`; more as `ids`, with the newest also as `id`, which a relay that reads `id` alone (release 2) still acts on.
 */
export function encodeLogNotice(notice: LogNotice): string {
  const key = { t: notice.tenantId, e: notice.entityType, i: notice.entityId };
  if ('retired' in notice) return JSON.stringify({ ...key, retired: true });
  const { logIds } = notice;
  const id = Math.max(...logIds);
  return JSON.stringify(logIds.length === 1 ? { ...key, id } : { ...key, id, ids: logIds });
}

const isKey = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isLogId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/** The notice a payload carries, or null for anything else. Never throws: any session on the database may notify on the channel. */
export function decodeLogNotice(payload: string): LogNotice | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { t, e, i, id, ids, retired } = parsed as Record<string, unknown>;
  if (!isKey(t) || !isKey(e) || !isKey(i)) return null;
  const key = { tenantId: t, entityType: e, entityId: i };
  if (retired === true) return { ...key, retired: true };
  if (ids !== undefined) return Array.isArray(ids) && ids.length > 0 && ids.every(isLogId) ? { ...key, logIds: ids } : null;
  return isLogId(id) ? { ...key, logIds: [id] } : null;
}
