import { z } from '@hono/zod-openapi';
import type { ProductEntityType } from 'shared';
import { widenedOpsKeyMap } from 'shared/version-changes';
import { stxBaseSchema } from '#/schemas';

/**
 * Create an ops-based update schema for a product entity.
 * Generates a consistent update contract: `{ ops: { [key]: value }, stx }`.
 *
 * The merge strategy is implicit from the value shape:
 * - Bare value (string, number, boolean, null) → scalar → LWW with HLC
 * - Object with `{ add, remove }` → set → AWSet delta
 *
 * Each field in `opsShape` is optional. The schema is refined to require at least one op.
 *
 * During a lens expand window, the schema is widened: the old field name is
 * accepted as an alias of its canonical twin (same value type), so old bundles
 * pass validation. `normalizeOps` (via `resolveUpdateOps`) canonicalizes after
 * validation. Aliases exist only at runtime — the static type stays canonical.
 *
 * @param entityType - Product entity the ops apply to (drives lens widening)
 * @param opsShape - Zod object shape where each key maps to its accepted value type
 *
 * @example
 * ```ts
 * const attachmentUpdateStxBodySchema = createUpdateSchema('attachment', {
 *   name: z.string(),
 *   originalKey: z.string(),
 * });
 * ```
 */
export function createUpdateSchema<T extends z.ZodRawShape>(entityType: ProductEntityType, opsShape: T) {
  const widened: Record<string, unknown> = { ...opsShape };
  for (const [from, to] of Object.entries(widenedOpsKeyMap(entityType))) {
    if (to in opsShape && !(from in opsShape)) widened[from] = opsShape[to];
  }
  const partialOps = z.object(widened as unknown as T).partial();

  return z
    .object({
      ops: partialOps,
      stx: stxBaseSchema,
    })
    .refine((val) => Object.keys(val.ops).length > 0, {
      message: 'At least one op must be provided',
      path: ['ops'],
    });
}
