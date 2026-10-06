/**
 * AWSet (Add-Wins Set) delta operations for set-type fields: compute deltas from full arrays and merge pending ones.
 * The backend applies them (`backend/src/core/stx/array-delta.ts`); optimistic updates write the full array.
 */

export type ArrayDelta = { add: string[]; remove: string[] };

/** Runtime check: is this value a set delta (`{ add, remove }`)? */
export function isArrayDelta(value: unknown): value is ArrayDelta {
  return value != null && typeof value === 'object' && 'add' in value;
}

/**
 * Returns the minimal `{ add, remove }` diff.
 * @public
 */
export function computeArrayDelta(oldIds: string[], newIds: string[]): ArrayDelta {
  const oldSet = new Set(oldIds);
  const newSet = new Set(newIds);
  return { add: newIds.filter((id) => !oldSet.has(id)), remove: oldIds.filter((id) => !newSet.has(id)) };
}

/** Used when squashing pending mutations: the later delta wins when the same id appears in both add and remove. */
export function mergeArrayDeltas(older: ArrayDelta, newer: ArrayDelta): ArrayDelta {
  const newerRemoveSet = new Set(newer.remove);
  const newerAddSet = new Set(newer.add);
  const mergedAdd = [...older.add.filter((id) => !newerRemoveSet.has(id) && !newerAddSet.has(id)), ...newer.add];
  const mergedRemove = [...older.remove.filter((id) => !newerAddSet.has(id) && !newerRemoveSet.has(id)), ...newer.remove];
  return { add: mergedAdd, remove: mergedRemove };
}
