import { z } from '@hono/zod-openapi';
import type { ProductEntityType } from 'shared';
import { stxBaseSchema } from '#/schemas';
import { isArrayDelta } from '../stx/array-delta';
import { widenBodySchema } from './lens-seam';

/**
 * Build a product update schema for `{ ops, stx }`. Declared ops are optional,
 * at least one is required, and active expand aliases leave the static type canonical.
 * Downstream resolution treats `{ add, remove }` values as AWSet deltas and all
 * other values as LWW scalars requiring a matching HLC timestamp.
 */
export function createUpdateSchema<T extends z.ZodRawShape>(entityType: ProductEntityType, opsShape: T) {
  const partialOps = widenBodySchema(entityType, z.object(opsShape).partial());

  return z
    .object({
      ops: partialOps,
      stx: stxBaseSchema,
    })
    .superRefine((val, ctx) => {
      const opEntries = Object.entries(val.ops);
      const opsByField = new Map(opEntries);
      if (opEntries.length === 0) {
        ctx.addIssue({ code: 'custom', message: 'At least one op must be provided', path: ['ops'] });
      }

      for (const [field, value] of opEntries) {
        if (!isArrayDelta(value) && !(field in val.stx.fieldTimestamps)) {
          ctx.addIssue({
            code: 'custom',
            message: `Missing HLC timestamp for scalar op "${field}"`,
            path: ['stx', 'fieldTimestamps', field],
          });
        }
      }

      for (const field of Object.keys(val.stx.fieldTimestamps)) {
        if (!opsByField.has(field) || isArrayDelta(opsByField.get(field))) {
          ctx.addIssue({
            code: 'custom',
            message: `Timestamp "${field}" does not match a scalar op`,
            path: ['stx', 'fieldTimestamps', field],
          });
        }
      }
    });
}
