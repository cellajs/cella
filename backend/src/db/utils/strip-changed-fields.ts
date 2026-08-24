import { type Column, sql } from 'drizzle-orm';

/**
 * Drops `changedFields` from an `stx` column: `column - 'changedFields'`. Set it on every
 * server-driven write. With the key absent the CDC worker computes the changed set from the WAL
 * diff; with it present the worker reuses the set a client recorded on an earlier edit, which
 * does not describe this write. Backend twin of `stripChangedFieldsStx` in
 * `cdc/src/utils/strip-changed-fields.ts` (not importable across the package boundary).
 */
export const stripChangedFields = (col: Column) => sql`${col} - 'changedFields'`;
