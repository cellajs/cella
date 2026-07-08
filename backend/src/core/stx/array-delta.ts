import { z } from '@hono/zod-openapi';

/**
 * Zod schema for AWSet delta operations.
 * Used for set-type fields (labels, assignedTo) in update ops.
 */
export const arrayDeltaSchema = z.object({
  add: z.array(z.string()).default([]),
  remove: z.array(z.string()).default([]),
});

export type ArrayDelta = z.infer<typeof arrayDeltaSchema>;

/** Runtime check: is this value a set delta (`{ add, remove }`)? */
export function isArrayDelta(value: unknown): value is ArrayDelta {
  return value != null && typeof value === 'object' && 'add' in value;
}

/**
 * Apply an AWSet delta to a current array.
 * Removes first, then appends. Order is preserved and repeated applications are idempotent.
 */
export function applyArrayDelta(current: string[], delta: ArrayDelta): string[] {
  const removeSet = new Set(delta.remove);
  const filtered = current.filter((id) => !removeSet.has(id));
  const existingSet = new Set(filtered);
  const toAdd = delta.add.filter((id) => !existingSet.has(id));
  return [...filtered, ...toAdd];
}
