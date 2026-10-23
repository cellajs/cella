import type { AnyPgTable } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { hasPublishedAt } from './published-predicate';

/** The draft boundary. Must match `publishedRowsPredicate`; `publication-filter.test.ts` pins the two together. */
export const publishedRowFilter = 'published_at IS NOT NULL';

/** Product tables only: channel publication gates members and stays unfiltered so path sync continues. */
export function publicationRowFilter(
  entityType: string,
  table: AnyPgTable,
  productTypes: readonly string[] = appConfig.productEntityTypes,
): string | undefined {
  return productTypes.includes(entityType) && hasPublishedAt(table) ? publishedRowFilter : undefined;
}
