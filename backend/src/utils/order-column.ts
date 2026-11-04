import { type AnyColumn, asc, desc, type SQL, type SQLWrapper } from 'drizzle-orm';
import type { OrderDirection } from '#/schemas/common-schemas';

interface GetOrderColumnsOpts<T extends Record<string, AnyColumn | SQLWrapper>, U extends keyof T> {
  sort: U;
  order: OrderDirection;
  columns: T;
  tieBreaker?: AnyColumn | SQLWrapper;
  append?: SQL[];
}

/** Resolves a list's sort and order, which its request schema defaults, to deterministic `.orderBy()` expressions. */
export const getOrderColumns = <T extends Record<string, AnyColumn | SQLWrapper>, U extends keyof T>({
  sort,
  order,
  columns,
  tieBreaker,
  append = [],
}: GetOrderColumnsOpts<T, U>): SQL[] => {
  const orderFunc = order === 'asc' ? asc : desc;
  const selected = columns[sort];
  const primaryOrder = orderFunc(selected);
  const stableOrder = tieBreaker && selected !== tieBreaker ? [orderFunc(tieBreaker)] : [];

  return [primaryOrder, ...stableOrder, ...append];
};
