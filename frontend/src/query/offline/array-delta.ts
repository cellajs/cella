/** AWSet (Add-Wins Set) delta operations for set-type fields: compute deltas from full arrays and apply them optimistically. */

export type ArrayDelta = { add: string[]; remove: string[] };

/** Runtime check: is this value a set delta (`{ add, remove }`)? */
export function isArrayDelta(value: unknown): value is ArrayDelta {
  return value != null && typeof value === 'object' && 'add' in value;
}

/** Returns the minimal `{ add, remove }` diff. */
export function computeArrayDelta(oldIds: string[], newIds: string[]): ArrayDelta {
  const oldSet = new Set(oldIds);
  const newSet = new Set(newIds);
  return {
    add: newIds.filter((id) => !oldSet.has(id)),
    remove: oldIds.filter((id) => !newSet.has(id)),
  };
}

/** Removes first and then appends, which preserves order and keeps the operation idempotent. */
export function applyArrayDelta(current: string[], delta: ArrayDelta): string[] {
  const removeSet = new Set(delta.remove);
  const filtered = current.filter((id) => !removeSet.has(id));
  const existingSet = new Set(filtered);
  const toAdd = delta.add.filter((id) => !existingSet.has(id));
  return [...filtered, ...toAdd];
}

/** Used when squashing pending mutations: the later delta wins when the same id appears in both add and remove. */
export function mergeArrayDeltas(older: ArrayDelta, newer: ArrayDelta): ArrayDelta {
  const newerRemoveSet = new Set(newer.remove);
  const newerAddSet = new Set(newer.add);
  const mergedAdd = [...older.add.filter((id) => !newerRemoveSet.has(id) && !newerAddSet.has(id)), ...newer.add];
  const mergedRemove = [
    ...older.remove.filter((id) => !newerAddSet.has(id) && !newerRemoveSet.has(id)),
    ...newer.remove,
  ];
  return { add: mergedAdd, remove: mergedRemove };
}
