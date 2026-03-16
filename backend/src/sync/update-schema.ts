import { z } from '@hono/zod-openapi';
import { stxRequestSchema } from '#/schemas';

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
 * @param opsShape - Zod object shape where each key maps to its accepted value type
 *
 * @example
 * ```ts
 * const attachmentUpdateStxBodySchema = createUpdateSchema({
 *   name: z.string(),
 *   originalKey: z.string(),
 * });
 * ```
 */
export function createUpdateSchema<T extends z.ZodRawShape>(opsShape: T) {
  const partialOps = z.object(opsShape).partial();

  return z
    .object({
      ops: partialOps,
      stx: stxRequestSchema,
    })
    .refine((val) => Object.keys(val.ops).length > 0, {
      message: 'At least one op must be provided',
      path: ['ops'],
    });
}
