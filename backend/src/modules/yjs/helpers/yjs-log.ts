// Database-free: the Yjs log's limits, keys, row shapes and notice codec, which the relay shares through `#/`.

/** The channel every append and retirement notifies on, in the writing transaction: a wake-up for relays, never content. */
export const YJS_LOG_CHANNEL = 'yjs_log';

/** The largest update the log takes: the cap the relay's socket puts on one frame. */
export const YJS_MAX_UPDATE_BYTES = 2 * 1024 * 1024;

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

/** What a relay hears on YJS_LOG_CHANNEL: a row appended to a document's log, or the document retired. Keys only. */
export type LogNotice =
  | { tenantId: string; entityType: string; entityId: string; logId: number }
  | { tenantId: string; entityType: string; entityId: string; retired: true };

/** The payload of a notice: short keys, so it stays far below the 8,000-byte limit on a notification. */
export function encodeLogNotice(notice: LogNotice): string {
  const key = { t: notice.tenantId, e: notice.entityType, i: notice.entityId };
  return JSON.stringify('retired' in notice ? { ...key, retired: true } : { ...key, id: notice.logId });
}

const isKey = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** The notice a payload carries, or null for anything else. Never throws: any session on the database may notify on the channel. */
export function decodeLogNotice(payload: string): LogNotice | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { t, e, i, id, retired } = parsed as Record<string, unknown>;
  if (!isKey(t) || !isKey(e) || !isKey(i)) return null;
  const key = { tenantId: t, entityType: e, entityId: i };
  if (retired === true) return { ...key, retired: true };
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? { ...key, logId: id } : null;
}
