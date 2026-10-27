import { z } from '@hono/zod-openapi';
import type { ProductEntityType } from 'shared';
import { widenBodySchema } from '#/core/schema-evolution/lens-seam';
import { isArrayDelta } from '#/core/stx/array-delta';
import { stxBaseSchema } from '#/schemas/sync-transaction-schemas';

/**
 * Product update schema for `{ ops, stx }`: declared ops are optional but at least one is required.
 * Resolution treats `{ add, remove }` as AWSet deltas and every other value as an LWW scalar needing an HLC.
 */
export function createUpdateSchema<T extends z.ZodRawShape>(entityType: ProductEntityType, opsShape: T) {
  const partialOps = widenBodySchema(entityType, z.object(opsShape).partial());

  return z.object({ ops: partialOps, stx: stxBaseSchema }).superRefine((val, ctx) => {
    const ops: Record<string, unknown> = val.ops;
    const opEntries = Object.entries(ops);
    if (opEntries.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'At least one op must be provided', path: ['ops'] });
    }

    for (const [field, value] of opEntries) {
      if (!isArrayDelta(value) && !(field in val.stx.fieldTimestamps)) {
        ctx.addIssue({ code: 'custom', message: `Missing HLC timestamp for scalar op "${field}"`, path: ['stx', 'fieldTimestamps', field] });
      }
    }

    for (const field of Object.keys(val.stx.fieldTimestamps)) {
      if (!Object.hasOwn(ops, field) || isArrayDelta(ops[field])) {
        ctx.addIssue({ code: 'custom', message: `Timestamp "${field}" does not match a scalar op`, path: ['stx', 'fieldTimestamps', field] });
      }
    }
  });
}
