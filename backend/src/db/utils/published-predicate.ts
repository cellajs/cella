import { isNotNull, type SQL } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';

/** Type guard: the table declares the opt-in `publishedAt` draft column (`published-column.ts`). */
export function hasPublishedAt(table: AnyPgTable): table is AnyPgTable & { publishedAt: PgColumn } {
  return 'publishedAt' in table;
}

/** For collection, delta and catchup reads: excludes drafts for everyone, the author included. */
export function publishedRowsPredicate(table: AnyPgTable): SQL | undefined {
  return hasPublishedAt(table) ? isNotNull(table.publishedAt) : undefined;
}
