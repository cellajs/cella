import { type Column, sql } from 'drizzle-orm';
import type { StxBase } from '#/schemas/sync-transaction-schemas';

/**
 * Drops `changedFields` from an `stx` column: `column - 'changedFields'`. Set it on every
 * server-driven write. With the key absent the CDC worker computes the changed set from the WAL
 * diff; with it present the worker reuses the set a client recorded on an earlier edit, which
 * does not describe this write.
 * @param ids - A write's own mutation and source ids when it sets no field timestamp, such as a soft delete: they
 *   replace the previous writer's, which would make that writer's tab take the change for its own echo.
 */
export const stripChangedFields = (col: Column, ids?: Pick<StxBase, 'mutationId' | 'sourceId'>) =>
  ids
    ? sql`(${col} - 'changedFields') || jsonb_build_object('mutationId', ${ids.mutationId}::text, 'sourceId', ${ids.sourceId}::text)`
    : sql`${col} - 'changedFields'`;
