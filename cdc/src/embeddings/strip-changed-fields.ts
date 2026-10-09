import { sql } from 'drizzle-orm';

/**
 * SQL expression every CDC-driven write must set on `stx`: dropping `changedFields`
 * makes handleUpdate fall back to the WAL diff, so the write is attributed to its
 * actual changed columns and stale client-driven changedFields cannot echo.
 */
export const stripChangedFieldsStx = () => sql`stx - 'changedFields'`;
