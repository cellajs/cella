import { eq, getColumns, isNotNull, or, type SQL } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';

/** Type guard: the table declares the opt-in `publishedAt` draft column (`published-column.ts`). */
export function hasPublishedAt(table: AnyPgTable): table is AnyPgTable & { publishedAt: PgColumn } {
  return 'publishedAt' in table;
}

/** For collection, delta and catchup reads: excludes drafts for everyone, the author included. */
export function publishedRowsPredicate(table: AnyPgTable): SQL | undefined {
  return hasPublishedAt(table) ? isNotNull(table.publishedAt) : undefined;
}

/**
 * SQL twin of `draftVisibleTo` (shared): published rows, plus the actor's own drafts. Undefined for a table without
 * drafts. A table without `createdBy` shows its drafts to nobody.
 * @param table - The product table being read.
 * @param actorId - The reading actor.
 */
export function draftVisibleRowsPredicate(table: AnyPgTable, actorId: string): SQL | undefined {
  if (!hasPublishedAt(table)) return undefined;
  const { createdBy } = getColumns(table) as Record<string, PgColumn | undefined>;
  if (!createdBy) return isNotNull(table.publishedAt);
  return or(isNotNull(table.publishedAt), eq(createdBy, actorId));
}
