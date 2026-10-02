import type { ProductEntityType } from 'shared';
import type { DbContext } from '#/core/context';
import { AppError } from '#/core/error';
import { yjsMaterializeScope } from '#/modules/yjs/helpers/materialize-window';
import { findServerYjsUpdate } from '#/modules/yjs/yjs-queries';

interface AssertMaterializeWindowOpts {
  entityType: ProductEntityType;
  /** The rows the materialized write left. */
  rows: readonly Record<string, unknown>[];
}

/**
 * Refuses a materialization (409) whose merge lacks a server-origin row of its document: an outside write committed
 * after the relay read its window, and the merge would overwrite it. Runs in the materializer's transaction
 * (`ctx.var.db`) after its UPDATE, which holds the entity row: an outside write committed before is visible here, and
 * one in flight waits for this transaction and then writes over it. The relay retries a 409, with a window that holds
 * the row. A materialized write outside materializeDescriptionOp carries no window and is not checked.
 */
export async function assertMaterializeWindow(ctx: DbContext, { entityType, rows }: AssertMaterializeWindowOpts): Promise<void> {
  const window = yjsMaterializeScope.getStore();
  if (!window) return;
  for (const { id, tenantId } of rows) {
    if (id !== window.entityId || typeof tenantId !== 'string') continue;
    const missing = await findServerYjsUpdate(ctx, { doc: { entityType, entityId: id, tenantId }, exceptIds: window.serverRowIds });
    if (missing) {
      throw new AppError(409, 'field_conflict', 'info', {
        entityType,
        meta: { reason: 'The document holds an outside write the merge lacks', logId: missing.id },
      });
    }
  }
}
