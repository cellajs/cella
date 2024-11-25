import { type AnyColumn, type SQLWrapper, asc, desc } from 'drizzle-orm';

export const getOrderColumn = <T extends Record<string, AnyColumn | SQLWrapper>, U extends keyof T>(
  sortOptions: T,
  sort: U | undefined,
  def: T[U],
  order: 'asc' | 'desc' = 'asc',
) => {
  const orderFunc = order === 'asc' ? asc : desc;
  return orderFunc(sort && sortOptions[sort] ? sortOptions[sort] : def);
};
