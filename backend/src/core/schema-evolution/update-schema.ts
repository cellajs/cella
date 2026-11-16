import { z } from '@hono/zod-openapi';
import type { ProductEntityType } from 'shared';
import { batchUpdateMax } from 'shared/sync-pace';
import { markFieldOperations } from '#/core/openapi-validation';
import { widenBodySchema } from '#/core/schema-evolution/lens-seam';
import { isArrayDelta } from '#/core/stx/array-delta';
import { translatedError, validUuidSchema } from '#/schemas/common-schemas';
import { type StxBase, stxBaseSchema } from '#/schemas/sync-transaction-schemas';

/** At least one op, and a stamp for exactly the scalar ops. */
const checkOps = (val: { ops: Record<string, unknown>; stx: StxBase }, ctx: z.RefinementCtx) => {
  const opEntries = Object.entries(val.ops);
  if (opEntries.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'At least one op must be provided', path: ['ops'] });
  }

  for (const [field, value] of opEntries) {
    if (!isArrayDelta(value) && !(field in val.stx.fieldTimestamps)) {
      ctx.addIssue({ code: 'custom', message: `Missing HLC timestamp for scalar op "${field}"`, path: ['stx', 'fieldTimestamps', field] });
    }
  }

  for (const field of Object.keys(val.stx.fieldTimestamps)) {
    if (!Object.hasOwn(val.ops, field) || isArrayDelta(val.ops[field])) {
      ctx.addIssue({ code: 'custom', message: `Timestamp "${field}" does not match a scalar op`, path: ['stx', 'fieldTimestamps', field] });
    }
  }
};

/**
 * Product update schema for `{ ops, stx }`: declared ops are optional but at least one is required.
 * Resolution treats `{ add, remove }` as AWSet deltas and every other value as an LWW scalar needing an HLC.
 */
export function createUpdateSchema<T extends z.ZodRawShape>(entityType: ProductEntityType, opsShape: T) {
  const partialOps = widenBodySchema(entityType, z.object(opsShape).partial());
  return markFieldOperations(z.object({ ops: partialOps, stx: stxBaseSchema }).superRefine(checkOps));
}

/** One row of a batch update: the single update's `{ ops, stx }` with the row's id. */
export function createUpdateItemSchema<T extends z.ZodRawShape>(entityType: ProductEntityType, opsShape: T) {
  const partialOps = widenBodySchema(entityType, z.object(opsShape).partial());
  return z.object({ id: validUuidSchema, ops: partialOps, stx: stxBaseSchema }).superRefine(checkOps);
}

/** The body of a batch update a product's module declares: 1 to `batchUpdateMax` of its update items, each of another row. */
export const batchUpdateBodySchema = <T extends z.ZodType<{ id: string }>>(item: T) =>
  item
    .array()
    .min(1)
    .max(batchUpdateMax)
    .refine(
      (items) => new Set(items.map(({ id }) => id.toLowerCase())).size === items.length,
      translatedError('error:invalid_duplicate_items', { name: 'ID' }),
    );
