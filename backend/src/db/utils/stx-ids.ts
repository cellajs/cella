import { type Column, sql } from 'drizzle-orm';
import type { StxBase } from '#/schemas/sync-transaction-schemas';

/**
 * A write's own mutation and source ids over the stored `stx` column, its field timestamps kept. Set it on a write
 * that stamps no field, such as a soft delete: the previous writer's ids would make that writer's tab take the change
 * for its own echo.
 */
export const stxWithIds = (col: Column, ids: Pick<StxBase, 'mutationId' | 'sourceId'>) =>
  sql`${col} || jsonb_build_object('mutationId', ${ids.mutationId}::text, 'sourceId', ${ids.sourceId}::text)`;
