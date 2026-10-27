/** Default gap between items when no neighbor exists. */
export const orderGap = 10;

/** Default order for the very first item in a list. */
export const defaultOrder = 1000;

/** Below this gap, midpoint averaging stops producing a distinct value. */
const minOrderGap = Number.EPSILON * 8;

interface OrderedItem {
  id: string;
  displayOrder: number;
}

/** Extends by `orderGap` at the list edges. Null means too little space: rebalance the siblings. */
export const getOrderBetween = (prev: number | undefined, next: number | undefined): number | null => {
  if (prev === undefined && next === undefined) return defaultOrder;
  if (prev === undefined) return (next as number) - orderGap;
  if (next === undefined) return prev + orderGap;
  if (next - prev < minOrderGap) return null;
  return (prev + next) / 2;
};

/** With `ascending` (the default) the visual top is the lowest order, descending the highest. */
export const getEdgeOrder = (existingOrders: number[], edge: 'top' | 'bottom', ascending = true): number => {
  if (existingOrders.length === 0) return defaultOrder;
  const visualTopIsMin = ascending;
  const placeAtVisualTop = edge === 'top';
  const useMin = placeAtVisualTop ? visualTopIsMin : !visualTopIsMin;
  return useMin ? Math.min(...existingOrders) - orderGap : Math.max(...existingOrders) + orderGap;
};

/**
 * Order of a membership an archive or restore moves: the bottom of the list it joins. The server writes it and the client
 * predicts it, so a moved menu row lands once.
 */
export const getArchiveMoveOrder = (
  memberships: { channelType: string; archived: boolean; displayOrder: number }[],
  channelType: string,
  archived: boolean,
): number =>
  getEdgeOrder(
    memberships
      .filter((membership) => membership.channelType === channelType && membership.archived === archived)
      // Ceil so a fractional displayOrder doesn't squeeze a future insert
      .map((membership) => Math.ceil(membership.displayOrder)),
    'bottom',
  );

/**
 * An integer in the open interval `(prev, next)` absent from `taken`, closest to the midpoint.
 * Falls back to the float midpoint only when every integer position is occupied.
 */
const pickCleanOrder = (prev: number, next: number, taken: Set<number>): number => {
  const midpoint = (prev + next) / 2;

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
 * Order for inserting an item next to a target, from the drop edge. Pass `ascending = false` for
 * descending lists such as board columns.
 */
export const getRelativeOrder = (items: OrderedItem[], targetOrder: number, sourceId: string, edge: string, ascending = true): number => {
  const insertBefore = ascending ? edge === 'top' : edge === 'bottom';

  const sourceOrder = items.find((item) => item.id === sourceId)?.displayOrder;
  const sorted = items.filter((item) => item.id !== sourceId).toSorted((a, b) => a.displayOrder - b.displayOrder);
  const taken = new Set(sorted.map((i) => i.displayOrder));

  const targetIdx = sorted.findIndex((item) => item.displayOrder === targetOrder);
  if (targetIdx === -1) {
    // Dropped on itself
    if (sourceOrder === targetOrder) return sourceOrder;
    // Target absent: extend past it on the requested side, snapped to an integer.
    return insertBefore ? Math.floor(targetOrder) - orderGap : Math.ceil(targetOrder) + orderGap;
  }

  const [prev, next] = insertBefore ? [sorted[targetIdx - 1]?.displayOrder, targetOrder] : [targetOrder, sorted[targetIdx + 1]?.displayOrder];

  // Dropped on the edge facing it: the slot is unchanged, so a new order would only churn a write
  const staysInSlot = sourceOrder !== undefined && (prev === undefined || prev < sourceOrder) && (next === undefined || sourceOrder < next);
  if (staysInSlot) return sourceOrder;

  // One neighbor: extend past it to a clean integer, even when targetOrder is fractional.
  if (prev === undefined && next !== undefined) return Math.floor(next) - orderGap;
  if (next === undefined && prev !== undefined) return Math.ceil(prev) + orderGap;

  if (prev === undefined || next === undefined) return getOrderBetween(prev, next) ?? targetOrder;
  if (next - prev < Number.EPSILON * 8) return targetOrder + (insertBefore ? -orderGap : orderGap);
  return pickCleanOrder(prev, next, taken);
};

/** The visual bottom of an ascending list. */
export const getNewItemOrder = (existingOrders: number[]): number => {
  return getEdgeOrder(existingOrders, 'bottom', true);
};
