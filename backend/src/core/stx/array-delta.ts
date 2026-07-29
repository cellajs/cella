import { z } from '@hono/zod-openapi';

/**
 * Build a bounded schema for AWSet delta operations.
 * Used for set-type fields such as labels and assignedTo in update ops.
 */
export const arrayDeltaSchema = <T extends z.ZodType<string>>(itemSchema: T, maxItems = 50) => {
  const itemsSchema = z
    .array(itemSchema)
    .max(maxItems)
    .refine((items) => new Set(items).size === items.length, 'Delta items must be unique');

  return z
    .object({
      add: itemsSchema.default([]),
      remove: itemsSchema.default([]),
    })
    .superRefine(({ add, remove }, ctx) => {
      const removed = new Set(remove);
      if (add.some((item) => removed.has(item))) {
        ctx.addIssue({ code: 'custom', message: 'The same item cannot be added and removed' });
      }
    });
};

export type ArrayDelta = {
  add: string[];
  remove: string[];
};

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
  const toAdd = delta.add.filter((id) => {
    if (existingSet.has(id)) return false;
    existingSet.add(id);
    return true;
  });
  return [...filtered, ...toAdd];
}
