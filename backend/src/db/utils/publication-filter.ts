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
 * Returns the CDC publication filter for product tables with a draft lifecycle.
 * PostgreSQL exposes publish/unpublish transitions as insert/delete events, keeping drafts
 * out of CDC. Channel publication gates members and remains unfiltered so path sync continues.
 */
export function publicationRowFilter(
  entityType: string,
  table: AnyPgTable,
  productTypes: readonly string[] = appConfig.productEntityTypes,
): string | undefined {
  return productTypes.includes(entityType) && hasPublishedAt(table) ? PUBLISHED_ROW_FILTER : undefined;
}
