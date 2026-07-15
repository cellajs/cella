import { type AnyColumn, asc, desc, type SQLWrapper } from 'drizzle-orm';

/**
 * Get a Drizzle `asc`/`desc` order column for `.orderBy()`, resolving `sort` against
 * `sortOptions` (a map of query-param sort keys → columns) and falling back to `def`.
 */
export const getOrderColumn = <T extends Record<string, AnyColumn | SQLWrapper>, U extends keyof T>(
  sort: U | undefined,
  def: T[U],
  // biome-ignore lint/style/useDefaultParameterLast: param order matches the URL query (sort, column, order, options); default kept for ~12 call-sites that omit it.
  order: 'asc' | 'desc' = 'asc',
  sortOptions: T,
) => {
  const orderFunc = order === 'asc' ? asc : desc;
  return orderFunc(sort && sortOptions[sort] ? sortOptions[sort] : def);
};
