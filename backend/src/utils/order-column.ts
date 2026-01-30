import { type AnyColumn, asc, desc, type SQLWrapper } from 'drizzle-orm';

/**
 * Get a Drizzle order column for use in `.orderBy()`.
 * @param sort - The sort key from query params
 * @param def - Default column to sort by if sort is undefined
 * @param order - Sort direction ('asc' or 'desc'), defaults to 'asc'
 * @param sortOptions - Object mapping sort keys to Drizzle columns
 * @returns A Drizzle `asc` or `desc` wrapped column
 */
export const getOrderColumn = <T extends Record<string, AnyColumn | SQLWrapper>, U extends keyof T>(
  sort: U | undefined,
  def: T[U],
  order: 'asc' | 'desc' = 'asc',
  sortOptions: T,
) => {
  const orderFunc = order === 'asc' ? asc : desc;
  return orderFunc(sort && sortOptions[sort] ? sortOptions[sort] : def);
};
