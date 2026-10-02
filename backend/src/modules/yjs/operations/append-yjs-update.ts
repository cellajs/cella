import type { DbContext } from '#/core/context';
import { YJS_MAX_UPDATE_BYTES, type YjsDocScope } from '#/modules/yjs/helpers/yjs-log';
import { classifyUpdate } from '#/modules/yjs/helpers/yjs-state';
import { notifyYjsLog } from '#/modules/yjs/operations/notify-yjs-log';
import { findYjsDocumentUnderKeyShare, insertYjsUpdate } from '#/modules/yjs/yjs-queries';

// No `#/env` import and no pool: the Yjs relay imports this file, and passes its own transaction as `ctx.var.db`.

/**
 * The outcome of an append. `empty`: the update carries nothing, so nothing was logged and nothing is missing.
 * `no-document`: never seeded, or retired. `stale-generation`: reseeded since, with the generation that holds now.
 */
export type AppendResult =
  | { status: 'appended'; id: number }
  | { status: 'empty' }
  | { status: 'malformed' | 'too-large' | 'no-document' }
  | { status: 'stale-generation'; generation: string };

export interface AppendYjsUpdateOpts {
  /** The document the update extends, with the organization its log row carries. */
  doc: YjsDocScope;
  /** The Yjs update to log. */
  update: Uint8Array;
  /** The client whose update this is, whom a materialization may credit; null for a server-origin row. */
  userId: string | null;
  /** The generation the update extends: a client's own, or the one an outside write just read. */
  generation: string;
  /** False skips the notification: the relay announces its appends after they commit, batched. Default true. */
  notify?: boolean;
}

/**
 * The one way into the log, for the relay, outside writes and (release 3) client updates over HTTP. An update larger
 * than YJS_MAX_UPDATE_BYTES, one Yjs cannot decode and one that carries nothing are answered before any query. Then the
 * document row of `generation` is held under FOR KEY SHARE until the caller's transaction ends, so a retirement, which
 * deletes that row first, waits for the insert and then deletes the log row too. The row is inserted and, unless
 * `notify` is false, announced on YJS_LOG_CHANNEL in the same transaction: relays hear of it at commit, and never of a
 * row that rolled back. The relay passes false: one notifying commit per keystroke would serialize its appends, so it
 * announces them after commit, batched. Runs under the document's tenant context, as `findYjsDocument` does.
 */
export async function appendYjsUpdate(
  ctx: DbContext,
  { doc, update, userId, generation, notify = true }: AppendYjsUpdateOpts,
): Promise<AppendResult> {
  if (update.length > YJS_MAX_UPDATE_BYTES) return { status: 'too-large' };
  const kind = classifyUpdate(update);
  if (kind === 'malformed') return { status: 'malformed' };
  if (kind === 'empty') return { status: 'empty' };

  const document = await findYjsDocumentUnderKeyShare(ctx, { doc });
  if (!document) return { status: 'no-document' };
  if (document.generation !== generation) return { status: 'stale-generation', generation: document.generation };

  const row = await insertYjsUpdate(ctx, { doc, userId, payload: update });
  const { entityType, entityId, tenantId } = doc;
  if (notify) await notifyYjsLog(ctx, { notices: [{ tenantId, entityType, entityId, logIds: [row.id] }] });
  return { status: 'appended', id: row.id };
}
