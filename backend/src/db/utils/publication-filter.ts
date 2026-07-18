import type { AnyPgTable } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { hasPublishedAt } from './published-predicate';

/**
 * The draft boundary, expressed once: rows enter the replication stream (and therefore
 * the sync engine) only when published. The CDC publication row filter and the API's
 * `publishedRowsPredicate` MUST express this same condition. A consistency test pins
 * the two together (`publication-filter.test.ts`).
 */
export const PUBLISHED_ROW_FILTER = 'published_at IS NOT NULL';

/**
 * Row filter for a table in the CDC publication, or undefined for unfiltered.
 *
 * ONLY product tables that opt into the draft lifecycle (`publishedColumn`) are
 * filtered: PG rewrites their publish edge into an INSERT and unpublish into a DELETE
 * at decode time (row-filter transitions are a PG 15 feature; cella documents PG 17+
 * as its floor, see infra/README; REPLICA IDENTITY FULL permits filtering on any
 * column), so drafts never reach the worker. CHANNEL tables are never filtered.
 * Their `publishedAt` (defaultNow) gates invitees, not readers, and filtering them
 * would also suppress channel-path-sync for channel drafts.
 */
export function publicationRowFilter(
  entityType: string,
  table: AnyPgTable,
  productTypes: readonly string[] = appConfig.productEntityTypes,
): string | undefined {
  return productTypes.includes(entityType) && hasPublishedAt(table) ? PUBLISHED_ROW_FILTER : undefined;
}
