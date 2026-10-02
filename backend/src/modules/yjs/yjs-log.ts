import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { ProductEntityType } from 'shared';
import type { DbOrTx, Tx } from '#/db/create-connection';
import { classifyUpdate } from '#/modules/yjs/helpers/yjs-state';
import { yjsDocumentsTable, yjsUpdatesTable } from '#/modules/yjs/yjs-db';

// No `#/env` import and no pool: the Yjs relay imports this file, and both sides pass their own transaction.

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

/** Notifies each notice on YJS_LOG_CHANNEL in one statement. In a transaction, delivered at commit and never after a rollback. */
async function notifyLog(db: DbOrTx, notices: LogNotice[]): Promise<void> {
  if (notices.length === 0) return;
  const payloads = sql.join(
    notices.map((notice) => sql`(${encodeLogNotice(notice)}::text)`),
    sql`, `,
  );
  await db.execute(sql`SELECT pg_notify(${YJS_LOG_CHANNEL}, notice.payload) FROM (VALUES ${payloads}) AS notice(payload)`);
}

/** `(entity_type, entity_id)` within the document's own tenant, so a read is the same with RLS bypassed. */
const docWhere = ({ entityType, entityId, tenantId }: YjsDocKey) =>
  and(eq(yjsDocumentsTable.entityType, entityType), eq(yjsDocumentsTable.entityId, entityId), eq(yjsDocumentsTable.tenantId, tenantId));

const logWhere = ({ entityType, entityId, tenantId }: YjsDocKey) =>
  and(eq(yjsUpdatesTable.entityType, entityType), eq(yjsUpdatesTable.entityId, entityId), eq(yjsUpdatesTable.tenantId, tenantId));

/** A document in one consistent read: the base state of its generation, and every log row not folded into it. */
export interface YjsDocumentRead {
  generation: string;
  base: Uint8Array;
  rows: LogRow[];
}

/**
 * The document row under FOR SHARE, then its log, oldest first; null when no row exists (never seeded, or retired).
 * The lock makes base and log one read: a compaction's base replace (an UPDATE of the row) commits before it or waits
 * for the caller's transaction, so the log never lacks rows folded into a base the read did not see. Appends hold the
 * row FOR KEY SHARE and do not wait. Runs in the caller's transaction, which carries the document's tenant context:
 * both tables are fail-closed under RLS, and a read without it finds no row.
 */
export async function readYjsDocument(tx: Tx, doc: YjsDocKey): Promise<YjsDocumentRead | null> {
  const [document] = await tx
    .select({ state: yjsDocumentsTable.state, generation: yjsDocumentsTable.generation })
    .from(yjsDocumentsTable)
    .where(docWhere(doc))
    .for('share');
  if (!document) return null;
  const rows = await tx
    .select({ id: yjsUpdatesTable.id, payload: yjsUpdatesTable.payload, userId: yjsUpdatesTable.userId })
    .from(yjsUpdatesTable)
    .where(logWhere(doc))
    .orderBy(asc(yjsUpdatesTable.id));
  return {
    generation: document.generation,
    base: new Uint8Array(document.state),
    rows: rows.map((row) => ({ ...row, payload: new Uint8Array(row.payload) })),
  };
}

/**
 * The outcome of an append. `empty`: the update carries nothing, so nothing was logged and nothing is missing.
 * `no-document`: never seeded, or retired. `stale-generation`: reseeded since, with the generation that holds now.
 */
export type AppendResult =
  | { status: 'appended'; id: number }
  | { status: 'empty' }
  | { status: 'malformed' | 'too-large' | 'no-document' }
  | { status: 'stale-generation'; generation: string };

export interface AppendOptions {
  /** The client whose update this is, whom a materialization may credit; null for a server-origin row. */
  userId: string | null;
  /** The generation the update extends: a client's own, or the one an outside write just read. */
  generation: string;
  /** False skips the notification. Default true. */
  notify?: boolean;
}

/**
 * The one way into the log, for the relay, outside writes and (release 3) client updates over HTTP. An update larger
 * than YJS_MAX_UPDATE_BYTES, one Yjs cannot decode and one that carries nothing are answered before any query. Then the
 * document row of `generation` is held under FOR KEY SHARE until the caller's transaction ends, so a retirement, which
 * deletes that row first, waits for the insert and then deletes the log row too. The row is inserted and, unless
 * `notify` is false, announced on YJS_LOG_CHANNEL in the same transaction: relays hear of it at commit, and never of a
 * row that rolled back. Runs under the document's tenant context, as {@link readYjsDocument} does.
 */
export async function appendYjsUpdate(
  tx: Tx,
  doc: YjsDocScope,
  update: Uint8Array,
  { userId, generation, notify = true }: AppendOptions,
): Promise<AppendResult> {
  if (update.length > YJS_MAX_UPDATE_BYTES) return { status: 'too-large' };
  const kind = classifyUpdate(update);
  if (kind === 'malformed') return { status: 'malformed' };
  if (kind === 'empty') return { status: 'empty' };

  const [document] = await tx.select({ generation: yjsDocumentsTable.generation }).from(yjsDocumentsTable).where(docWhere(doc)).for('key share');
  if (!document) return { status: 'no-document' };
  if (document.generation !== generation) return { status: 'stale-generation', generation: document.generation };

  const { entityType, entityId, tenantId, organizationId } = doc;
  const [row] = await tx
    .insert(yjsUpdatesTable)
    .values({ entityType, entityId, tenantId, organizationId, userId, payload: Buffer.from(update) })
    .returning({ id: yjsUpdatesTable.id });
  if (notify) await notifyLog(tx, [{ tenantId, entityType, entityId, logId: row.id }]);
  return { status: 'appended', id: row.id };
}

/**
 * Deletes the collaborative documents of `ids`, base and log, and announces each retired document on YJS_LOG_CHANNEL,
 * so a relay that holds a session on it ends the session at once. For deletions: the yjs module's `<type>.deleted`
 * handler runs it in the transaction of the delete, and an app whose delete path dispatches no event calls it itself.
 * The document row goes first: an append holds it under FOR KEY SHARE, so one in flight commits before the log delete,
 * which takes its row too, and a later one finds no row and is refused.
 */
export async function retireYjsDocuments(db: DbOrTx, entityType: ProductEntityType, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const retired = await db
    .delete(yjsDocumentsTable)
    .where(and(eq(yjsDocumentsTable.entityType, entityType), inArray(yjsDocumentsTable.entityId, ids)))
    .returning({ entityId: yjsDocumentsTable.entityId, tenantId: yjsDocumentsTable.tenantId });
  await db.delete(yjsUpdatesTable).where(and(eq(yjsUpdatesTable.entityType, entityType), inArray(yjsUpdatesTable.entityId, ids)));
  await notifyLog(
    db,
    retired.map(({ entityId, tenantId }) => ({ tenantId, entityType, entityId, retired: true as const })),
  );
}
