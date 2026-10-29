import { z } from '@hono/zod-openapi';
import type { ProductEntityType } from 'shared';
import { tombstoneKeys } from '#/utils/seq-range';

/** A page of a list: its `items` and the `total` the list holds. */
export const paginationSchema = <O, I>(schema: z.ZodType<O, I>) => z.object({ items: z.array(schema), total: z.number() });

/** A page of a product list, whose range reads return soft-deleted rows as tombstones (`projectTombstones`). */
export const productListResponseSchema = <T extends z.ZodObject>(entityType: ProductEntityType, schema: T) => {
  const kept = new Set(tombstoneKeys(entityType));
  const tombstone = z
    .object({ ...Object.fromEntries(Object.entries(schema.shape).filter(([key]) => kept.has(key))), deletedAt: z.string() })
    .describe('A soft-deleted row: the fields that place it, without its content.');
  return paginationSchema(z.union([schema, tombstone]));
};

/** Passing an item schema produces `data: T[]`; omitting it requires an empty data array. */
export const batchResponseSchema = <T extends z.ZodTypeAny>(itemSchema?: T) =>
  z.object({
    data: itemSchema ? z.array(itemSchema) : z.tuple([]).rest(z.never()),
    rejectedIds: z.array(z.string()).describe('Identifiers of items that could not be processed'),
    rejectionReasons: z.record(z.string(), z.array(z.string())).optional().describe('Map of reason code to rejected item IDs'),
  });

/** The result of a batch operation that returns no rows: the rejected ids, optionally by reason. */
export interface BatchResponseEmpty {
  data: [];
  rejectedIds: string[];
  rejectionReasons?: Record<string, string[]>;
}
