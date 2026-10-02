import type { ProductEntityType } from 'shared';
import type { DbContext } from '#/core/context';
import { AppError } from '#/core/error';
import { mergeLog } from '#/modules/yjs/helpers/yjs-state';
import { appendYjsUpdate } from '#/modules/yjs/operations/append-yjs-update';
import { findYjsDocument } from '#/modules/yjs/yjs-queries';

/** An entity row an outside write left: the keys its document is stored under, and the description it now holds. */
export interface YjsWrittenRow {
  id: string;
  tenantId: string;
  organizationId: string | null;
  description: string | null;
}

interface RecordYjsOutsideWriteOpts {
  entityType: ProductEntityType;
  /** The rows the write left, each with the description it wrote. */
  rows: readonly YjsWrittenRow[];
}

/**
 * Turns a description written outside the relay (a REST update, an MCP tool, an import) into a server-origin update of
 * the entity's collaborative document: base and log are read and merged, the written blocks are diffed into them, and
 * the change is appended with no user and announced to the relays at commit. Live editors receive it as an edit; the
 * document and its generation stay. A row with no document is skipped: the next seed reads the row.
 *
 * Runs in the write's own transaction (`ctx.var.db`), after the entity UPDATE: that row lock orders outside writes to
 * one entity, and the diff is taken against the log as committed then, so an edit committed earlier is overwritten
 * where the write differs and a later one merges. The yjs module's `<type>.updated` handler calls it for every write
 * whose stored stx names the description; an app write path that dispatches no `<type>.updated` calls it itself, after
 * its UPDATE.
 * @throws AppError 400 when a document exists and the description is one the editor schema cannot hold; the write
 * then rolls back, so row and document never part.
 */
export async function recordYjsOutsideWrite(ctx: DbContext, { entityType, rows }: RecordYjsOutsideWriteOpts): Promise<void> {
  for (const row of rows) {
    const doc = { entityType, entityId: row.id, tenantId: row.tenantId, organizationId: row.organizationId };
    const document = await findYjsDocument(ctx, { doc });
    if (!document) continue;

    // BlockNote loads on the first outside write to a live document only.
    const { descriptionToUpdate } = await import('#/modules/yjs/helpers/description-update');
    let update: Uint8Array | null;
    try {
      update = descriptionToUpdate(mergeLog(document.base, document.rows).state, row.description);
    } catch (error) {
      throw new AppError(400, 'invalid_request', 'warn', {
        entityType,
        meta: { reason: 'The description does not fit the collaborative document' },
        originalError: error instanceof Error ? error : undefined,
      });
    }
    if (!update) continue;

    const result = await appendYjsUpdate(ctx, { doc, update, userId: null, generation: document.generation, notify: true });
    if (result.status === 'appended' || result.status === 'empty') continue;
    if (result.status === 'too-large') {
      throw new AppError(400, 'invalid_request', 'warn', {
        entityType,
        meta: { reason: 'The description change is too large for the collaborative document' },
      });
    }
    // The document row is held FOR SHARE since the read, so no reseed or retirement comes between: a bug.
    throw new Error(`Outside write to ${entityType}:${row.id} refused by the Yjs log: ${result.status}`);
  }
}
