/**
 * AWSet (Add-Wins Set) delta operations for set-type fields.
 * Used on the client to compute deltas from full arrays and apply them optimistically.
 */

export type ArrayDelta = { add: string[]; remove: string[] };

/** Runtime check: is this value a set delta (`{ add, remove }`)? */
export function isArrayDelta(value: unknown): value is ArrayDelta {
  return value != null && typeof value === 'object' && 'add' in value;
}

/**
 * Compute an AWSet delta from old and new ID arrays.
 * Returns `{ add, remove }` representing the minimal diff.
 */
export function computeArrayDelta(oldIds: string[], newIds: string[]): ArrayDelta {
  const oldSet = new Set(oldIds);
  const newSet = new Set(newIds);
  return {
    add: newIds.filter((id) => !oldSet.has(id)),
    remove: oldIds.filter((id) => !newSet.has(id)),
  };
}

/**
 * Apply an AWSet delta to a current array.
 * Removes first, then appends to preserve order and stay idempotent.
 */
export function applyArrayDelta(current: string[], delta: ArrayDelta): string[] {
  const removeSet = new Set(delta.remove);
  const filtered = current.filter((id) => !removeSet.has(id));
  const existingSet = new Set(filtered);
  const toAdd = delta.add.filter((id) => !existingSet.has(id));
  return [...filtered, ...toAdd];
}

/**
 * Merge two AWSet deltas (for squashing pending mutations).
 * Later delta takes precedence when the same ID appears in both add and remove.
 */
export function mergeArrayDeltas(older: ArrayDelta, newer: ArrayDelta): ArrayDelta {
  const newerRemoveSet = new Set(newer.remove);
  const newerAddSet = new Set(newer.add);
  // Union of adds, minus anything the newer delta removes or already adds
  const mergedAdd = [...older.add.filter((id) => !newerRemoveSet.has(id) && !newerAddSet.has(id)), ...newer.add];
  // Union of removes, minus anything the newer delta adds or already removes
  const mergedRemove = [
    ...older.remove.filter((id) => !newerAddSet.has(id) && !newerRemoveSet.has(id)),
    ...newer.remove,
  ];
  return { add: mergedAdd, remove: mergedRemove };
}
