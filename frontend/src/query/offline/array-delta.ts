import type { ArrayDelta } from 'shared/utils/array-delta';

export { type ArrayDelta, isArrayDelta } from 'shared/utils/array-delta';

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
