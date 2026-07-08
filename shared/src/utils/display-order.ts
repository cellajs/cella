/** Default gap between items when no neighbor exists. */
export const orderGap = 10;

/** Default order for the very first item in a list. */
export const defaultOrder = 1000;

/**
 * Minimum float gap below which midpoint averaging stops producing a distinct
 * value. Exceeding this means a rebalance of the affected sibling group is
 * required.
 */
const minOrderGap = Number.EPSILON * 8;

interface OrderedItem {
  id: string;
  displayOrder: number;
}

/**
 * Compute an order strictly between `prev` and `next`. Either bound may be
 * omitted to get an edge order (extends past the existing bound by `orderGap`).
 *
 * Returns `null` when both bounds are present and too close to split. The
 * caller should rebalance the sibling group.
 *
 * - `getOrderBetween(undefined, undefined)` → `defaultOrder`
 * - `getOrderBetween(undefined, 50)` → `40`
 * - `getOrderBetween(50, undefined)` → `60`
 * - `getOrderBetween(50, 60)` → `55`
 */
export const getOrderBetween = (prev: number | undefined, next: number | undefined): number | null => {
  if (prev === undefined && next === undefined) return defaultOrder;
  if (prev === undefined) return (next as number) - orderGap;
  if (next === undefined) return prev + orderGap;
  if (next - prev < minOrderGap) return null;
  return (prev + next) / 2;
};

/**
 * Compute an order at one edge of an existing list: at the visual top or
 * bottom of the stack.
 *
 * - `ascending = true` (default): visual top = lowest order.
 * - `ascending = false` (descending): visual top = highest order.
 */
export const getEdgeOrder = (existingOrders: number[], edge: 'top' | 'bottom', ascending = true): number => {
  if (existingOrders.length === 0) return defaultOrder;
  const visualTopIsMin = ascending;
  const placeAtVisualTop = edge === 'top';
  const useMin = placeAtVisualTop ? visualTopIsMin : !visualTopIsMin;
  return useMin ? Math.min(...existingOrders) - orderGap : Math.max(...existingOrders) + orderGap;
};

/**
 * Pick a clean integer in the open interval `(prev, next)` that isn't already
 * in `taken`, preferring the integer closest to the midpoint. Falls back to
 * the float midpoint when no integer slot is free.
 *
 * Keeps lists tidy: as long as there's room, we never introduce fractions.
 */
const pickCleanOrder = (prev: number, next: number, taken: Set<number>): number => {
  const midpoint = (prev + next) / 2;

  // Search outward from the rounded midpoint within the open interval.
  const lo = Math.floor(prev) + 1;
  const hi = Math.ceil(next) - 1;
  if (lo > hi) return midpoint;

  const start = Math.min(hi, Math.max(lo, Math.round(midpoint)));
  for (let radius = 0; radius <= hi - lo; radius++) {
    const up = start + radius;
    if (up >= lo && up <= hi && !taken.has(up)) return up;
    const down = start - radius;
    if (radius > 0 && down >= lo && down <= hi && !taken.has(down)) return down;
  }
  return midpoint;
};

/**
 * Compute an order for inserting an item relative to a target, based on the
 * drop edge. Direction-aware: pass `ascending = false` for descending lists
 * (e.g. task board columns).
 *
 * Snaps to a free integer when one exists in the gap, falling back to the
 * float midpoint only when the integer slots are all taken.
 */
export const getRelativeOrder = (
  items: OrderedItem[],
  targetOrder: number,
  sourceId: string,
  edge: string,
  ascending = true,
): number => {
  const insertBefore = ascending ? edge === 'top' : edge === 'bottom';

  const sorted = items.filter((item) => item.id !== sourceId).toSorted((a, b) => a.displayOrder - b.displayOrder);
  const taken = new Set(sorted.map((i) => i.displayOrder));

  const targetIdx = sorted.findIndex((item) => item.displayOrder === targetOrder);
  // Target not found: extend past it on the requested side, snapped to an integer.
  if (targetIdx === -1) {
    return insertBefore ? Math.floor(targetOrder) - orderGap : Math.ceil(targetOrder) + orderGap;
  }

  const [prev, next] = insertBefore
    ? [sorted[targetIdx - 1]?.displayOrder, targetOrder]
    : [targetOrder, sorted[targetIdx + 1]?.displayOrder];

  // Only one neighbor → extend past the existing one to a clean integer
  // (regardless of whether `targetOrder` itself is fractional).
  if (prev === undefined && next !== undefined) return Math.floor(next) - orderGap;
  if (next === undefined && prev !== undefined) return Math.ceil(prev) + orderGap;

  // Both neighbors present → prefer a free integer, fall back to float midpoint.
  if (prev === undefined || next === undefined) return getOrderBetween(prev, next) ?? targetOrder;
  if (next - prev < Number.EPSILON * 8) return targetOrder + (insertBefore ? -orderGap : orderGap);
  return pickCleanOrder(prev, next, taken);
};

/**
 * Compute the order for a brand-new item appended at the visual bottom of an
 * ascending list. Equivalent to `getEdgeOrder(orders, 'bottom', true)`.
 */
export const getNewItemOrder = (existingOrders: number[]): number => {
  return getEdgeOrder(existingOrders, 'bottom', true);
};
