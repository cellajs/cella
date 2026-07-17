import { isNotNull, type SQL } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';

/** Type guard: the table declares the opt-in `publishedAt` draft column (`published-column.ts`). */
export function hasPublishedAt(table: AnyPgTable): table is AnyPgTable & { publishedAt: PgColumn } {
  return 'publishedAt' in table;
}

/**
 * Published-rows-only predicate for collection, delta and catchup reads: excludes
 * unpublished drafts for EVERYONE, author included — drafts live outside the sync
 * engine and surface via a dedicated drafts query, never the feed (see
 * `shared/src/published-rows.ts`). `undefined` (no-op) for tables without the column.
 */
export function publishedRowsPredicate(table: AnyPgTable): SQL | undefined {
  return hasPublishedAt(table) ? isNotNull(table.publishedAt) : undefined;
}
