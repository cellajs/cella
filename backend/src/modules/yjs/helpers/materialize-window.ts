import { AsyncLocalStorage } from 'node:async_hooks';
import { and, eq, isNull, notInArray } from 'drizzle-orm';
import type { ProductEntityType } from 'shared';
import { AppError } from '#/core/error';
import type { Tx } from '#/db/create-connection';
import { yjsUpdatesTable } from '#/modules/yjs/yjs-db';

/** The window a materialization writes: its entity, and the server-origin log rows the relay merged into it. */
export interface YjsMaterializeWindow {
  entityId: string;
  serverRowIds: readonly number[];
}

/**
 * Set by materializeDescriptionOp around the entity's materializer, so the `<type>.updated` handler its write dispatches
 * can check the window; app materializers need no change.
 */
export const yjsMaterializeScope = new AsyncLocalStorage<YjsMaterializeWindow>();

/**
 * Refuses a materialization (409) whose merge lacks a server-origin row of its document: an outside write committed
 * after the relay read its window, and the merge would overwrite it. Runs in the materializer's transaction after its
 * UPDATE, which holds the entity row: an outside write committed before is visible here, and one in flight waits for
 * this transaction and then writes over it. The relay retries a 409, with a window that holds the row. A materialized
 * write outside materializeDescriptionOp carries no window and is not checked.
 */
export async function assertMaterializeWindow(tx: Tx, entityType: ProductEntityType, rows: readonly Record<string, unknown>[]): Promise<void> {
  const window = yjsMaterializeScope.getStore();
  if (!window) return;
  for (const { id, tenantId } of rows) {
    if (id !== window.entityId || typeof tenantId !== 'string') continue;
    const [missing] = await tx
      .select({ id: yjsUpdatesTable.id })
      .from(yjsUpdatesTable)
      .where(
        and(
          eq(yjsUpdatesTable.entityType, entityType),
          eq(yjsUpdatesTable.entityId, id),
          eq(yjsUpdatesTable.tenantId, tenantId),
          isNull(yjsUpdatesTable.userId),
          window.serverRowIds.length > 0 ? notInArray(yjsUpdatesTable.id, [...window.serverRowIds]) : undefined,
        ),
      )
      .limit(1);
    if (missing) {
      throw new AppError(409, 'field_conflict', 'info', {
        entityType,
        meta: { reason: 'The document holds an outside write the merge lacks', logId: missing.id },
      });
    }
  }
}
