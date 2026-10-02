import type { ProductEntityType } from 'shared';
import type { OrgContext } from '#/core/context';
import { AppError } from '#/core/error';
import { tenantContext } from '#/db/tenant-context';
import { appendYjsUpdate } from '#/modules/yjs/operations/append-yjs-update';
import { authorizeYjsEditor } from '#/modules/yjs/operations/authorize-yjs-editor';
import { queueYjsLogNotice } from '#/modules/yjs/operations/queue-yjs-log-notice';

export interface PushYjsUpdateOpts {
  entityType: ProductEntityType;
  entityId: string;
  /** The generation the update was made in. */
  generation: string;
  update: Uint8Array;
}

/**
 * Logs one update of a client that cannot reach the relay, under the caller, whom a materialization may credit, through
 * the log's one way in (`appendYjsUpdate`). The append notifies nothing in its transaction (F9 in
 * DESCRIPTION_SYNC_RELEASE3.md): once it committed, the notice is queued for the relays, which relay the row to live
 * sessions and fold it at compaction, or at their sweep when no session holds the document. The answer follows the
 * commit, so `appended` and `empty` both mean the server holds the update.
 * @param ctx - A user acting in a resolved organization.
 * @param opts - The document, the generation the update extends, and the update.
 * @returns `appended`, or `empty` for an update that carries nothing.
 * @throws AppError 403 or 404 as `authorizeYjsEditor`; 400 for an update Yjs cannot decode; 413 for one past the log's
 * cap; 409 `sync_document_replaced` when the document has another generation (`meta.generation`) or none (null: pull,
 * which seeds it, then post again).
 */
export async function pushYjsUpdateOp(
  ctx: OrgContext,
  { entityType, entityId, generation, update }: PushYjsUpdateOpts,
): Promise<{ status: 'appended' | 'empty' }> {
  const doc = await authorizeYjsEditor(ctx, { entityType, entityId });
  const userId = ctx.var.actor.id;
  const result = await tenantContext(ctx, (txCtx) => appendYjsUpdate(txCtx, { doc, update, userId, generation, notify: false }));

  switch (result.status) {
    case 'appended':
      await queueYjsLogNotice({ tenantId: doc.tenantId, entityType, entityId: doc.entityId, logIds: [result.id] });
      return { status: 'appended' };
    case 'empty':
      return { status: 'empty' };
    case 'malformed':
      throw new AppError(400, 'invalid_request', 'warn', { entityType, meta: { reason: 'The update does not decode' } });
    case 'too-large':
      throw new AppError(413, 'body_too_large', 'warn', { entityType });
    case 'no-document':
      throw new AppError(409, 'sync_document_replaced', 'info', { entityType, meta: { generation: null } });
    case 'stale-generation':
      throw new AppError(409, 'sync_document_replaced', 'info', { entityType, meta: { generation: result.generation } });
  }
}
