import { type Column, sql } from 'drizzle-orm';
import type { StxBase } from '#/schemas/sync-transaction-schemas';

/**
 * A write's own mutation and source ids over the stored `stx` column, its field timestamps kept. Set it on a write
 * that stamps no field, such as a soft delete: the previous writer's ids would make that writer's tab take the change
 * for its own echo.
 */
export const stxWithIds = (col: Column, ids: Pick<StxBase, 'mutationId' | 'sourceId'>) =>
  sql`${col} || jsonb_build_object('mutationId', ${ids.mutationId}::text, 'sourceId', ${ids.sourceId}::text)`;

/**
 * The `stx` of the tombstone the CDC worker writes on an owned embedded row once no live host names it
 * (`appConfig.productEmbeddings`, lifecycle `owned`): the worker's own ids and the `collected` mark. The mark tells
 * that tombstone from one a person made, and a host write that names the row again brings back the first alone. No
 * request sets it: the stx schema of a request body holds no such key, and a person's delete reaches live rows, which
 * carry none.
 */
export const stxCollected = (col: Column, mutationId: string) =>
  sql`${stxWithIds(col, { mutationId, sourceId: 'cdc' })} || '{"collected": true}'::jsonb`;

/** Whether a row's `stx` carries the mark of {@link stxCollected}. */
export const isCollected = (col: Column) => sql`${col} @> '{"collected": true}'::jsonb`;

/** The `stx` of the write that brings a collected row back: that write's ids, and the mark gone. */
export const stxRestored = (col: Column, ids: Pick<StxBase, 'mutationId' | 'sourceId'>) => sql`(${stxWithIds(col, ids)}) - 'collected'::text`;
