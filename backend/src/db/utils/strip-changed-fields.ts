import { type Column, sql } from 'drizzle-orm';
import type { StxBase } from '#/schemas/sync-transaction-schemas';

/**
 * Drops `changedFields` from an `stx` column: `column - 'changedFields'`. Set it on every
 * server-driven write: the yjs module reads the key inside each write's transaction
 * (`wroteDescription`), and one kept from an earlier write names fields this write did not write.
 * @param ids - A write's own mutation and source ids when it sets no field timestamp, such as a soft delete: they
 *   replace the previous writer's, which would make that writer's tab take the change for its own echo.
 */
export const stripChangedFields = (col: Column, ids?: Pick<StxBase, 'mutationId' | 'sourceId'>) =>
  ids
    ? sql`(${col} - 'changedFields') || jsonb_build_object('mutationId', ${ids.mutationId}::text, 'sourceId', ${ids.sourceId}::text)`
    : sql`${col} - 'changedFields'`;
