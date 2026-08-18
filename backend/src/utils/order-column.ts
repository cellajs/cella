import { type AnyColumn, asc, desc, type SQL, type SQLWrapper } from 'drizzle-orm';

type OrderDirection = 'asc' | 'desc';

interface GetOrderColumnsOpts<T extends Record<string, AnyColumn | SQLWrapper>, U extends keyof T> {
  sort: U | undefined;
  order: OrderDirection | undefined;
  fallback: readonly [sort: U, order: OrderDirection];
  columns: T;
  tieBreaker?: AnyColumn | SQLWrapper;
  append?: SQL[];
}

/** Resolves API sorting to deterministic `.orderBy()` expressions. */
export const getOrderColumns = <T extends Record<string, AnyColumn | SQLWrapper>, U extends keyof T>({
  sort,
  order,
  fallback,
  columns,
  tieBreaker,
  append = [],
}: GetOrderColumnsOpts<T, U>): SQL[] => {
  const [fallbackSort, fallbackOrder] = fallback;
  const orderFunc = (order ?? fallbackOrder) === 'asc' ? asc : desc;
  const selected = columns[sort ?? fallbackSort] ?? columns[fallbackSort];
  const primaryOrder = orderFunc(selected);
  const stableOrder = tieBreaker && selected !== tieBreaker ? [orderFunc(tieBreaker)] : [];

  return [primaryOrder, ...stableOrder, ...append];
};
