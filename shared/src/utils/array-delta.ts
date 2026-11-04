/** An AWSet (add-wins set) delta of a set-type field. The backend applies it (`backend/src/core/stx/array-delta.ts`); optimistic updates write the full array. */
export type ArrayDelta = { add: string[]; remove: string[] };

/** Runtime check: is this value a set delta (`{ add, remove }`, both arrays)? */
export function isArrayDelta(value: unknown): value is ArrayDelta {
  return value != null && typeof value === 'object' && 'add' in value && 'remove' in value && Array.isArray(value.add) && Array.isArray(value.remove);
}
